import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function RoleBasedRedirect() {
  const { user, loading, rolesLoading, hasRole, subscriptionTier, orgId } = useAuth();

  if (loading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  // User signed up but hasn't completed onboarding (no org yet)
  if (!orgId) {
    return <Navigate to="/onboarding" replace />;
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
