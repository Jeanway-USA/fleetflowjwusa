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

  // Not signed in → send to the internal login screen.
  if (!user) return <Navigate to="/auth" replace />;

  // Drivers still owe onboarding paperwork must complete it first.
  if (hasRole('driver') && requiresOnboarding && !onboardingCompleted) {
    return <Navigate to="/driver/onboarding" replace />;
  }

  return <Navigate to={getRoleHomePath(roles, subscriptionTier)} replace />;
}
