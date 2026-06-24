import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type AppRole = Database['public']['Enums']['app_role'];
export type SubscriptionTier = 'solo_bco' | 'fleet_owner' | 'agency' | 'all_in_one' | 'open_beta';

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
  tmsMode: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  hidePromotions: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: Error | null }>;
  requiresOnboarding: boolean;
  onboardingCompleted: boolean;
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
  clearOrgSimulation: () => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [simulatedRole, setSimulatedRole] = useState<AppRole | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('solo_bco');
  const [tmsMode, setTmsMode] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [hidePromotions, setHidePromotions] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgIsActive, setOrgIsActive] = useState(true);
  const [simulatedOrgId, setSimulatedOrgId] = useState<string | null>(null);
  const [simulatedOrgName, setSimulatedOrgName] = useState<string | null>(null);
  const [simulatedOrgTier, setSimulatedOrgTier] = useState<string | null>(null);
  const [requiresOnboarding, setRequiresOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const superAdminCheckedRef = useRef<string | null>(null);

  // Helpers that no-op after unmount to avoid setState-on-unmounted warnings
  // and clobbering of a remounted provider's state by the discarded mount.
  const safeSet = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (value: React.SetStateAction<T>) => {
      if (isMountedRef.current) setter(value);
    };

  const resetTenantState = useCallback(() => {
    setOrgId(null);
    setOrgName(null);
    setSubscriptionTier('solo_bco');
    setTmsMode(null);
    setPrimaryColor(null);
    setLogoUrl(null);
    setBannerUrl(null);
    setHidePromotions(false);
    setOrgIsActive(true);
    setRequiresOnboarding(false);
    setOnboardingCompleted(false);
    setIsSuperAdmin(false);
    setSimulatedRole(null);
    superAdminCheckedRef.current = null;
  }, []);

  const fetchUserRoles = async (userId: string): Promise<AppRole[]> => {
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
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('org_id, requires_onboarding, onboarding_completed')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (!isMountedRef.current) return;
      setRequiresOnboarding(!!profile?.requires_onboarding);
      setOnboardingCompleted(!!profile?.onboarding_completed);

      if (profile?.org_id) {
        if (!isMountedRef.current) return;
        setOrgId(profile.org_id);
        const { data: orgData, error: orgErr } = await supabase
          .from('organizations')
          .select('name, subscription_tier, primary_color, logo_url, banner_url, is_active, tms_mode, hide_promotions')
          .eq('id', profile.org_id)
          .maybeSingle();

        if (orgErr) throw orgErr;
        if (!isMountedRef.current) return;

        if (orgData) {
          setOrgName(orgData.name);
          setOrgIsActive(orgData.is_active !== false);
          setSubscriptionTier((orgData.subscription_tier as SubscriptionTier) || 'solo_bco');
          setTmsMode(orgData.tms_mode || 'landstar');
          setPrimaryColor(orgData.primary_color || null);
          setLogoUrl(orgData.logo_url || null);
          setBannerUrl(orgData.banner_url || null);
          setHidePromotions(!!orgData.hide_promotions);
        }
      } else {
        // No org yet — reset so previous user's tenant doesn't leak through.
        if (!isMountedRef.current) return;
        setOrgId(null);
        setOrgName(null);
        setSubscriptionTier('solo_bco');
        setTmsMode(null);
        setPrimaryColor(null);
        setLogoUrl(null);
        setBannerUrl(null);
        setHidePromotions(false);
        setOrgIsActive(true);
      }
    } catch (err) {
      console.warn('[Auth] fetchOrgData failed:', err);
      if (!isMountedRef.current) return;
      // On error, fall back to safe defaults rather than retaining prior user's values.
      setRequiresOnboarding(false);
      setOnboardingCompleted(false);
    }
  };

  const refreshOrgData = async () => {
    if (!user) return;
    setOrgLoading(true);
    try {
      await fetchOrgData(user.id);
    } finally {
      if (isMountedRef.current) setOrgLoading(false);
    }
  };

  const refreshRoles = async () => {
    if (!user) return;
    setRolesLoading(true);
    try {
      const fetchedRoles = await fetchUserRoles(user.id);
      if (isMountedRef.current) setRoles(fetchedRoles);
    } finally {
      if (isMountedRef.current) setRolesLoading(false);
    }
  };

  const clearOrgSimulation = useCallback(async () => {
    try {
      await supabase.rpc('super_admin_stop_impersonation' as any);
    } catch (err) {
      console.warn('[Auth] stop impersonation failed:', err);
    }
    localStorage.removeItem('simulatedOrgId');
    localStorage.removeItem('simulatedOrgName');
    localStorage.removeItem('simulatedOrgTier');
    setSimulatedOrgId(null);
    setSimulatedOrgName(null);
    setSimulatedOrgTier(null);
    if (currentUserIdRef.current) {
      await fetchOrgData(currentUserIdRef.current);
    }
  }, []);

  // Super admin check via server-side RPC (no hardcoded emails)
  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (!user) {
        setIsSuperAdmin(false);
        superAdminCheckedRef.current = null;
        return;
      }
      if (superAdminCheckedRef.current === user.id) return;
      superAdminCheckedRef.current = user.id;
      const { data, error } = await supabase.rpc('is_super_admin');
      if (!isMountedRef.current) return;
      const isSA = !error && data === true;
      setIsSuperAdmin(isSA);

      // Hydrate active impersonation state from server so a refresh
      // doesn't desync the banner from the actually-impersonated org.
      if (isSA) {
        const { data: stateRows } = await supabase.rpc('super_admin_impersonation_state' as any);
        const row = Array.isArray(stateRows) ? stateRows[0] : null;
        if (row?.impersonating_org_id) {
          localStorage.setItem('simulatedOrgId', row.impersonating_org_id);
          localStorage.setItem('simulatedOrgName', row.impersonating_org_name ?? '');
          if (isMountedRef.current) {
            setSimulatedOrgId(row.impersonating_org_id);
            setSimulatedOrgName(row.impersonating_org_name ?? '');
          }
        } else {
          localStorage.removeItem('simulatedOrgId');
          localStorage.removeItem('simulatedOrgName');
          localStorage.removeItem('simulatedOrgTier');
          if (isMountedRef.current) {
            setSimulatedOrgId(null);
            setSimulatedOrgName(null);
            setSimulatedOrgTier(null);
          }
        }
      }
    };
    checkSuperAdmin();
  }, [user]);

  useEffect(() => {
    const handler = () => {
      if (!isSuperAdmin) {
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
    isMountedRef.current = true;

    // Set up auth state listener first. Wrap callback body so a malformed
    // event from the SDK can never crash the provider.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        try {
          // Skip INITIAL_SESSION — the boot block below handles the cached
          // session (calls getSession + getUser + fetches roles/org).
          // Letting this event also fetch causes a duplicate round-trip.
          if (event === 'INITIAL_SESSION') {
            return;
          }

          // Explicit SIGNED_OUT handling — covers revocations from other
          // tabs, admin deletions, refresh-token failures. Reset all
          // tenant state so the next sign-in starts clean.
          if (event === 'SIGNED_OUT') {
            if (!isMountedRef.current) return;
            const wasSignedIn = currentUserIdRef.current !== null;
            setSession(null);
            setUser(null);
            setRoles([]);
            setRolesLoading(false);
            setOrgLoading(false);
            currentUserIdRef.current = null;
            resetTenantState();
            setLoading(false);
            if (wasSignedIn) {
              toast.error('Your session expired. Please sign in again.');
            }
            return;
          }

          const previousUserId = currentUserIdRef.current;
          if (!isMountedRef.current) return;
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          currentUserIdRef.current = nextSession?.user?.id ?? null;

          if (nextSession?.user) {
            // Only re-fetch roles/org when the user actually changed
            // (not on TOKEN_REFRESHED which fires on tab focus).
            const userChanged = nextSession.user.id !== previousUserId;
            if (userChanged) {
              setRolesLoading(true);
              setOrgLoading(true);
              setTimeout(() => {
                if (!isMountedRef.current) return;
                fetchUserRoles(nextSession.user.id)
                  .then((fetchedRoles) => { if (isMountedRef.current) setRoles(fetchedRoles); })
                  .catch((err) => {
                    console.warn('[Auth] fetchUserRoles failed:', err);
                    if (isMountedRef.current) setRoles([]);
                  })
                  .finally(() => { if (isMountedRef.current) setRolesLoading(false); });
                fetchOrgData(nextSession.user.id)
                  .catch((err) => console.warn('[Auth] fetchOrgData failed:', err))
                  .finally(() => { if (isMountedRef.current) setOrgLoading(false); });
              }, 0);
            }
          } else {
            setRoles([]);
            setRolesLoading(false);
            resetTenantState();
            setOrgLoading(false);
          }

          setLoading(false);
        } catch (err) {
          console.warn('[Auth] onAuthStateChange handler error:', err);
          if (isMountedRef.current) {
            setLoading(false);
            setRolesLoading(false);
            setOrgLoading(false);
          }
        }
      }
    );

    // Then check for existing session. Wrap the whole boot block so any
    // SDK rejection (network, malformed cache, unclassified auth error)
    // degrades gracefully to "logged out" instead of leaving the UI
    // stuck on a spinner.
    (async () => {
      try {
        const { data: { session: bootSession } } = await supabase.auth.getSession();

        // Validate that the cached session is still valid server-side.
        // getSession() returns cached JWTs even after the user is deleted
        // or the session was revoked; getUser() re-validates with the
        // Auth server. Sign out on failure so edge functions don't break.
        if (bootSession?.user) {
          let validateErr: unknown = null;
          try {
            const { error } = await supabase.auth.getUser();
            validateErr = error;
          } catch (e) {
            validateErr = e;
          }
          if (validateErr) {
            const msg = (validateErr as { message?: string })?.message ?? String(validateErr);
            console.warn('[Auth] Cached session is invalid server-side, signing out:', msg);
            try { await supabase.auth.signOut(); } catch { /* ignore */ }
            if (!isMountedRef.current) return;
            setSession(null);
            setUser(null);
            currentUserIdRef.current = null;
            setRoles([]);
            setRolesLoading(false);
            setOrgLoading(false);
            setLoading(false);
            return;
          }
        }

        if (!isMountedRef.current) return;

        // Concurrency guard: if a SIGNED_IN listener event already
        // populated state for this same user while we were awaiting,
        // skip the duplicate role/org fetch.
        const alreadyHandledByListener =
          currentUserIdRef.current !== null &&
          currentUserIdRef.current === (bootSession?.user?.id ?? null);

        setSession(bootSession);
        setUser(bootSession?.user ?? null);
        currentUserIdRef.current = bootSession?.user?.id ?? null;

        if (bootSession?.user && !alreadyHandledByListener) {
          setRolesLoading(true);
          setOrgLoading(true);
          fetchUserRoles(bootSession.user.id)
            .then((fetchedRoles) => { if (isMountedRef.current) setRoles(fetchedRoles); })
            .catch((err) => {
              console.warn('[Auth] fetchUserRoles failed:', err);
              if (isMountedRef.current) setRoles([]);
            })
            .finally(() => { if (isMountedRef.current) setRolesLoading(false); });
          fetchOrgData(bootSession.user.id)
            .catch((err) => console.warn('[Auth] fetchOrgData failed:', err))
            .finally(() => { if (isMountedRef.current) setOrgLoading(false); });
        } else if (!bootSession?.user) {
          setRolesLoading(false);
          setOrgLoading(false);
        }
      } catch (err) {
        // Final safety net — never let an init error leave the app stuck.
        console.warn('[Auth] Boot init failed, continuing as logged out:', err);
        if (!isMountedRef.current) return;
        setSession(null);
        setUser(null);
        currentUserIdRef.current = null;
        setRoles([]);
        setRolesLoading(false);
        setOrgLoading(false);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [resetTenantState]);


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
    // Optimistically clear ALL auth + tenant state so protected routes
    // redirect immediately and the next account never sees prior branding.
    setSession(null);
    setUser(null);
    setRoles([]);
    currentUserIdRef.current = null;
    resetTenantState();

    // Clear per-user QoL state (recents + form drafts) so the next account
    // doesn't see prior tenant data leaking through localStorage.
    try {
      localStorage.removeItem('jw-recents:v1');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('jw-draft:')) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }

    try {
      await supabase.auth.signOut();
    } finally {
      if (isMountedRef.current) setLoading(false);
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
    ? ['owner', 'safety'].includes(simulatedRole)
    : roles.some(r => ['owner', 'safety'].includes(r));

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
      orgId,
      orgName,
      orgIsActive,
      subscriptionTier,
      tmsMode,
      primaryColor,
      logoUrl,
      bannerUrl,
      hidePromotions,
      refreshOrgData,
      refreshRoles,
      simulatedOrgId,
      simulatedOrgName,
      clearOrgSimulation,
      isSuperAdmin,
      requiresOnboarding,
      onboardingCompleted,
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
