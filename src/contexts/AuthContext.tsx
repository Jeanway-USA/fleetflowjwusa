import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  simulatedRole: AppRole | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  setSimulatedRole: (role: AppRole | null) => void;
  isOwner: boolean;
  isAdmin: boolean;
  isSimulating: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [simulatedRole, setSimulatedRole] = useState<AppRole | null>(null);

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

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetching
        if (session?.user) {
          setTimeout(() => {
            fetchUserRoles(session.user.id).then(setRoles);
          }, 0);
        } else {
          setRoles([]);
          setSimulatedRole(null); // Clear simulation on logout
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRoles(session.user.id).then(setRoles);
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
    setSimulatedRole(null);
    await supabase.auth.signOut();
    setRoles([]);
  };

  // Check if user has a role - respects simulation mode
  const hasRole = (role: AppRole) => {
    // If simulating, only return true for the simulated role
    if (simulatedRole) {
      return role === simulatedRole;
    }
    return roles.includes(role);
  };

  // Real owner status (ignores simulation)
  const actuallyIsOwner = roles.includes('owner');
  
  // Simulated owner status
  const isOwner = simulatedRole ? simulatedRole === 'owner' : actuallyIsOwner;
  
  const isAdmin = simulatedRole 
    ? ['owner', 'payroll_admin', 'dispatcher', 'safety'].includes(simulatedRole)
    : roles.some(r => ['owner', 'payroll_admin', 'dispatcher', 'safety'].includes(r));

  const isSimulating = simulatedRole !== null;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      roles,
      simulatedRole,
      signIn,
      signUp,
      signOut,
      hasRole,
      setSimulatedRole,
      isOwner,
      isAdmin,
      isSimulating,
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
