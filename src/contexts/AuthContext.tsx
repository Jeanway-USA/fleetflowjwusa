import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
export type SubscriptionTier = 'solo_bco' | 'fleet_owner' | 'agency' | 'all_in_one';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  orgLoading: boolean;
  roles: AppRole[];
  simulatedRole: AppRole | null;
  orgId: string | null;
  orgName: string | null;
  orgIsActive: boolean;
  subscriptionTier: SubscriptionTier;
  primaryColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  /** 
   * SECURITY NOTE: Role simulation is UI-only for testing purposes.
   * All actual data access is controlled by server-side RLS policies.
   * Only real owners can use this feature.
   */
  setSimulatedRole: (role: AppRole | null) => void;
  canSimulateRoles: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isSimulating: boolean;
  hasPayrollAccess: boolean;
  hasOperationsAccess: boolean;
  hasSafetyAccess: boolean;
  refreshOrgData: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  simulatedOrgId: string | null;
  simulatedOrgName: string | null;
  clearOrgSimulation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [simulatedRole, setSimulatedRole] = useState<AppRole | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('solo_bco');
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgIsActive, setOrgIsActive] = useState(true);
  const [simulatedOrgId, setSimulatedOrgId] = useState<string | null>(null);
  const [simulatedOrgName, setSimulatedOrgName] = useState<string | null>(null);
  const [simulatedOrgTier, setSimulatedOrgTier] = useState<string | null>(null);

  const fetchUserRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching roles:', error);
      return [];
    }
    
    return data?.map(r => r.role) || [];
  };

  const DEMO_EMAIL = 'demo@fleetflow-tms.com';
  const isDemoMode = user?.email === DEMO_EMAIL;

  const fetchOrgData = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('user_id', userId)
      .single();

    if (profile?.org_id) {
      setOrgId(profile.org_id);
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name, subscription_tier, primary_color, logo_url, banner_url, is_active')
        .eq('id', profile.org_id)
        .single();

      if (orgData) {
        setOrgName(orgData.name);
        setOrgIsActive(orgData.is_active !== false);
        setSubscriptionTier((orgData.subscription_tier as SubscriptionTier) || 'solo_bco');
        setPrimaryColor(orgData.primary_color || null);
        setLogoUrl(orgData.logo_url || null);
        setBannerUrl(orgData.banner_url || null);
      }
    }
  };

  const refreshOrgData = async () => {
    if (user) {
      await fetchOrgData(user.id);
    }
  };

  const refreshRoles = async () => {
    if (user) {
      const fetchedRoles = await fetchUserRoles(user.id);
      setRoles(fetchedRoles);
    }
  };

  const clearOrgSimulation = useCallback(() => {
    localStorage.removeItem('simulatedOrgId');
    localStorage.removeItem('simulatedOrgName');
    localStorage.removeItem('simulatedOrgTier');
    setSimulatedOrgId(null);
    setSimulatedOrgName(null);
    setSimulatedOrgTier(null);
  }, []);

  // Listen for simulatedOrgChanged events - only super admins can simulate orgs
  const SUPER_ADMIN_EMAILS = ["andrew@jeanwayusa.com", "siadrak@jeanwayusa.com", "hr@jeanwayusa.com"];
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '');

  useEffect(() => {
    const handler = () => {
      if (!isSuperAdmin) {
        // Non-super-admins: clear any simulated state
        localStorage.removeItem('simulatedOrgId');
        localStorage.removeItem('simulatedOrgName');
        localStorage.removeItem('simulatedOrgTier');
        setSimulatedOrgId(null);
        setSimulatedOrgName(null);
        setSimulatedOrgTier(null);
        return;
      }
      setSimulatedOrgId(localStorage.getItem('simulatedOrgId'));
      setSimulatedOrgName(localStorage.getItem('simulatedOrgName'));
      setSimulatedOrgTier(localStorage.getItem('simulatedOrgTier'));
    };
    window.addEventListener('simulatedOrgChanged', handler);
    return () => window.removeEventListener('simulatedOrgChanged', handler);
  }, [isSuperAdmin]);

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setRolesLoading(true);
          setOrgLoading(true);
          setTimeout(() => {
            fetchUserRoles(session.user.id).then((fetchedRoles) => {
              setRoles(fetchedRoles);
              setRolesLoading(false);
            });
            fetchOrgData(session.user.id).finally(() => setOrgLoading(false));
          }, 0);
        } else {
          setRoles([]);
          setRolesLoading(false);
          setSimulatedRole(null);
          setOrgId(null);
          setOrgName(null);
          setSubscriptionTier('solo_bco');
          setOrgLoading(false);
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setRolesLoading(true);
        setOrgLoading(true);
        fetchUserRoles(session.user.id).then((fetchedRoles) => {
          setRoles(fetchedRoles);
          setRolesLoading(false);
        });
        fetchOrgData(session.user.id).finally(() => setOrgLoading(false));
      } else {
        setRolesLoading(false);
        setOrgLoading(false);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      }
    });

    if (!error && data.user) {
      // Update profile with name
      await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('user_id', data.user.id);
    }

    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    // Ensure the UI never gets stuck in a loading state if signOut is slow/fails.
    setLoading(true);
    setSimulatedRole(null);
    // Optimistically clear local auth state so protected routes redirect immediately.
    setSession(null);
    setUser(null);
    setRoles([]);

    try {
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  // Check if user has a role - respects simulation mode
  const hasRole = (role: AppRole) => {
    // If simulating, only return true for the simulated role
    if (simulatedRole) {
      return role === simulatedRole;
    }
    return roles.includes(role);
  };

  // Real owner status (ignores simulation) - this is the ONLY check for role simulation permission
  const actuallyIsOwner = roles.includes('owner');
  
  // Only actual owners can simulate other roles (security requirement)
  const canSimulateRoles = actuallyIsOwner;
  
  // Secure setSimulatedRole that only works for actual owners
  const handleSetSimulatedRole = (role: AppRole | null) => {
    if (!actuallyIsOwner && role !== null) {
      console.warn('Security: Only owners can simulate roles. Ignoring request.');
      return;
    }
    setSimulatedRole(role);
  };
  
  // Simulated owner status
  const isOwner = simulatedRole ? simulatedRole === 'owner' : actuallyIsOwner;
  
  const isAdmin = simulatedRole 
    ? ['owner', 'payroll_admin', 'dispatcher', 'safety'].includes(simulatedRole)
    : roles.some(r => ['owner', 'payroll_admin', 'dispatcher', 'safety'].includes(r));

  const isSimulating = simulatedRole !== null;

  // Granular access control - matches database functions
  const hasPayrollAccess = simulatedRole 
    ? ['owner', 'payroll_admin'].includes(simulatedRole)
    : roles.some(r => ['owner', 'payroll_admin'].includes(r));

  const hasOperationsAccess = simulatedRole 
    ? ['owner', 'dispatcher'].includes(simulatedRole)
    : roles.some(r => ['owner', 'dispatcher'].includes(r));

  const hasSafetyAccess = simulatedRole 
    ? ['owner', 'dispatcher'].includes(simulatedRole)
    : roles.some(r => ['owner', 'dispatcher'].includes(r));

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      rolesLoading,
      orgLoading,
      roles,
      simulatedRole,
      isDemoMode,
      signIn,
      signUp,
      signOut,
      hasRole,
      setSimulatedRole: handleSetSimulatedRole,
      canSimulateRoles,
      isOwner,
      isAdmin,
      isSimulating,
      hasPayrollAccess,
      hasOperationsAccess,
      hasSafetyAccess,
      orgId: simulatedOrgId || orgId,
      orgName: simulatedOrgName || orgName,
      orgIsActive,
      subscriptionTier: (simulatedOrgTier as SubscriptionTier) || subscriptionTier,
      primaryColor,
      logoUrl,
      bannerUrl,
      refreshOrgData,
      refreshRoles,
      simulatedOrgId,
      simulatedOrgName,
      clearOrgSimulation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
