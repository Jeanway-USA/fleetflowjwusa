import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TierGate } from '@/components/shared/TierGate';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  requiredFeature?: string;
}

export function ProtectedRoute({ children, allowedRoles, requiredFeature }: ProtectedRouteProps) {
  const { user, loading, rolesLoading, orgLoading, hasRole, orgIsActive, orgId, requiresOnboarding, onboardingCompleted } = useAuth();

  if (loading || rolesLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Organization deactivated — block access
  if (orgId && !orgIsActive) {
    return <Navigate to="/account-deactivated" replace />;
  }

  // Check if user has at least one of the allowed roles
  const hasAccess = allowedRoles.some(role => hasRole(role));
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  // Drivers with outstanding onboarding cannot reach any protected page until they finish.
  if (
    hasRole('driver') &&
    requiresOnboarding &&
    !onboardingCompleted &&
    !allowedRoles.every(r => r === 'driver' && false) // always evaluate; just keeps shape
  ) {
    // Allow the onboarding page itself through; everything else is blocked.
    if (typeof window !== 'undefined' && window.location.pathname !== '/driver/onboarding') {
      return <Navigate to="/driver/onboarding" replace />;
    }
  }

  // Wrap in layout, then optionally gate by tier feature
  const content = requiredFeature ? (
    <TierGate requiredFeature={requiredFeature}>{children}</TierGate>
  ) : (
    <>{children}</>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
