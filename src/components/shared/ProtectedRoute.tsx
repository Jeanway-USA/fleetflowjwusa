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
  const { user, loading, rolesLoading, hasRole } = useAuth();

  if (loading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has at least one of the allowed roles
  const hasAccess = allowedRoles.some(role => hasRole(role));
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  // Wrap in layout, then optionally gate by tier feature
  const content = requiredFeature ? (
    <TierGate requiredFeature={requiredFeature}>{children}</TierGate>
  ) : (
    <>{children}</>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
