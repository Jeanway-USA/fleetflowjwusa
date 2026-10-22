import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAreaAccess } from '@/hooks/useAreaAccess';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TierGate } from '@/components/shared/TierGate';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getRoleHomePath } from '@/lib/role-home';
import type { Database } from '@/integrations/supabase/types';
import { onboardingPath } from '@/lib/onboarding/path';

type AppRole = Database['public']['Enums']['app_role'];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  requiredFeature?: string;
  /** Render the page on its own, without the office sidebar and top bar (the tablet app brings its own). */
  bare?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, requiredFeature, bare }: ProtectedRouteProps) {
  const {
    user,
    loading,
    rolesLoading,
    orgLoading,
    roles,
    hasRole,
    subscriptionTier,
    orgIsActive,
    orgId,
    requiresOnboarding,
    onboardingCompleted,
    simulatedRole,
    setSimulatedRole,
  } = useAuth();
  const location = useLocation();
  const { allowsFeature } = useAreaAccess();
  const toastedPathRef = useRef<string | null>(null);

  const stillLoading = loading || rolesLoading || orgLoading;
  const authenticated = !!user;
  const actuallyIsOwner = roles.includes('owner');
  // Real owners can always access every protected route, regardless of any
  // simulated role they may be viewing the UI as. Simulation affects what
  // they see — it must never block their navigation.
  const hasAccess = actuallyIsOwner || (allowedRoles.some(role => hasRole(role)) && allowsFeature(requiredFeature));

  const showAccessDeniedToast = authenticated && !stillLoading && !hasAccess;

  // Fire access-denied toast exactly once per pathname.
  useEffect(() => {
    if (showAccessDeniedToast && toastedPathRef.current !== location.pathname) {
      toastedPathRef.current = location.pathname;
      toast.error("You don't have access to that page");
    }
  }, [showAccessDeniedToast, location.pathname]);

  if (stillLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (orgId && !orgIsActive) {
    return <Navigate to="/account-deactivated" replace />;
  }

  if (!hasAccess) {
    return <Navigate to={getRoleHomePath(roles, subscriptionTier)} replace />;
  }


  // Anyone with outstanding onboarding must finish first: drivers in the driver flow, everyone else in staff onboarding.
  if (requiresOnboarding && !onboardingCompleted) {
    const target = onboardingPath(hasRole('driver'));
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith(target)) {
      return <Navigate to={target} replace />;
    }
  }

  const content = requiredFeature ? (
    <TierGate requiredFeature={requiredFeature}>{children}</TierGate>
  ) : (
    <>{children}</>
  );

  return bare ? <>{content}</> : <DashboardLayout>{content}</DashboardLayout>;
}
