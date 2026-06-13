import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TierGate } from '@/components/shared/TierGate';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getRoleHomePath } from '@/lib/role-home';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  requiredFeature?: string;
}

export function ProtectedRoute({ children, allowedRoles, requiredFeature }: ProtectedRouteProps) {
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
  const toastedPathRef = useRef<string | null>(null);

  const stillLoading = loading || rolesLoading || orgLoading;
  const authenticated = !!user;
  const actuallyIsOwner = roles.includes('owner');
  // Owners have global access to every protected route (role simulation still
  // takes precedence — when an owner simulates a non-owner role, hasRole('owner')
  // returns false and the normal allowedRoles check applies).
  const hasAccess = hasRole('owner') || allowedRoles.some(role => hasRole(role));

  // If a real owner is simulating a lower role and lands on a route that role
  // can't access, automatically exit simulation so they aren't trapped.
  // Without this, the fallback redirect sends them to a page their simulation
  // also can't access, leaving them stuck with a recurring access-denied toast.
  useEffect(() => {
    if (!stillLoading && authenticated && actuallyIsOwner && simulatedRole && !hasAccess) {
      setSimulatedRole(null);
    }
  }, [stillLoading, authenticated, actuallyIsOwner, simulatedRole, hasAccess, setSimulatedRole]);

  const showAccessDeniedToast =
    authenticated && !stillLoading && !hasAccess && !(actuallyIsOwner && simulatedRole);

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

  // While the simulation-exit effect above runs, don't redirect — wait one
  // render so the cleared simulation grants access on the next pass.
  if (!hasAccess && actuallyIsOwner && simulatedRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to={getRoleHomePath(roles, subscriptionTier)} replace />;
  }


  // Drivers with outstanding onboarding must finish first.
  if (hasRole('driver') && requiresOnboarding && !onboardingCompleted) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/driver/onboarding') {
      return <Navigate to="/driver/onboarding" replace />;
    }
  }

  const content = requiredFeature ? (
    <TierGate requiredFeature={requiredFeature}>{children}</TierGate>
  ) : (
    <>{children}</>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
