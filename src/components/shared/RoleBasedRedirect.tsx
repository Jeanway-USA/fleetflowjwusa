import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

import { getRoleHomePath } from '@/lib/role-home';

export function RoleBasedRedirect() {
  const {
    user,
    loading,
    rolesLoading,
    orgLoading,
    roles,
    hasRole,
    subscriptionTier,
    orgId,
    orgIsActive,
    requiresOnboarding,
    onboardingCompleted,
  } = useAuth();

  if (loading || rolesLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Landing />;

  if (!orgId) return <Navigate to="/onboarding" replace />;
  if (!orgIsActive) return <Navigate to="/account-deactivated" replace />;

  if (hasRole('driver') && requiresOnboarding && !onboardingCompleted) {
    return <Navigate to="/driver/onboarding" replace />;
  }

  return <Navigate to={getRoleHomePath(roles, subscriptionTier)} replace />;
}
