import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Landing from '@/pages/Landing';

export function RoleBasedRedirect() {
  const {
    user,
    loading,
    rolesLoading,
    orgLoading,
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

  if (!user) {
    return <Landing />;
  }

  // User signed up but hasn't completed onboarding (no org yet)
  if (!orgId) {
    return <Navigate to="/onboarding" replace />;
  }

  // Organization deactivated — redirect to deactivation page
  if (!orgIsActive) {
    return <Navigate to="/account-deactivated" replace />;
  }

  // Drivers who still owe onboarding must finish it before anything else
  if (hasRole('driver') && requiresOnboarding && !onboardingCompleted) {
    return <Navigate to="/driver/onboarding" replace />;
  }

  // Owner routing — tier-aware
  if (hasRole('owner')) {
    switch (subscriptionTier) {
      case 'solo_bco':
      case 'open_beta':
        return <Navigate to="/fleet-loads" replace />;
      case 'agency':
        return <Navigate to="/agency-loads" replace />;
      case 'fleet_owner':
      case 'all_in_one':
      default:
        return <Navigate to="/executive-dashboard" replace />;
    }
  }

  if (hasRole('dispatcher')) {
    return <Navigate to="/dispatcher-dashboard" replace />;
  }

  if (hasRole('driver')) {
    return <Navigate to="/driver-dashboard" replace />;
  }

  if (hasRole('maintenance')) {
    return <Navigate to="/maintenance-home" replace />;
  }

  if (hasRole('safety') || hasRole('payroll_admin')) {
    return <Navigate to="/executive-dashboard" replace />;
  }

  return <Navigate to="/pending-access" replace />;
}
