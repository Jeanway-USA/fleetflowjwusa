import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function RoleBasedRedirect() {
  const { user, loading, roles, hasRole } = useAuth();
  const [rolesChecked, setRolesChecked] = useState(false);

  // Give roles a moment to load after user is authenticated
  useEffect(() => {
    if (user && !loading) {
      // Wait a short time for roles to load, then mark as checked
      const timeout = setTimeout(() => {
        setRolesChecked(true);
      }, 500);
      return () => clearTimeout(timeout);
    } else {
      setRolesChecked(false);
    }
  }, [user, loading]);

  // Still loading auth state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - go to login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Roles haven't loaded yet and we haven't timed out - wait briefly
  if (roles.length === 0 && !rolesChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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

  // Fallback for users with no recognized role (after roles were checked)
  return <Navigate to="/pending-access" replace />;
}
