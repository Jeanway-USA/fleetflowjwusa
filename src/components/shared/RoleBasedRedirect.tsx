import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Landing from '@/pages/Landing';

export function RoleBasedRedirect() {
  const { user, loading, rolesLoading, orgLoading, hasRole, subscriptionTier, orgId, orgIsActive } = useAuth();

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

  // Owner routing — tier-aware
  if (hasRole('owner')) {
    switch (subscriptionTier) {
      case 'solo_bco':
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

  if (hasRole('safety') || hasRole('payroll_admin')) {
    return <Navigate to="/executive-dashboard" replace />;
  }

  return <Navigate to="/pending-access" replace />;
}
