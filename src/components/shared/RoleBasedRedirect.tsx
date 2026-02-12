import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function RoleBasedRedirect() {
  const { user, loading, rolesLoading, hasRole } = useAuth();

  // Still loading auth state or roles
  if (loading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - show landing page
  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  // Route based on role priority
  if (hasRole('owner')) {
    return <Navigate to="/executive-dashboard" replace />;
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

  // Fallback for users with no recognized role
  return <Navigate to="/pending-access" replace />;
}
