import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import Landing from '@/pages/Landing';

export function RoleBasedRedirect() {
  const { user, loading, rolesLoading, orgLoading, hasRole, subscriptionTier, orgId, orgIsActive } = useAuth();

  const isDriver = !!user && hasRole('driver');

  // For drivers: check if they still need to sign onboarding documents
  const { data: driverOnboarding, isLoading: onboardingLoading } = useQuery({
    queryKey: ['driver-onboarding-check', user?.id, orgId],
    enabled: !!user && !!orgId && isDriver,
    queryFn: async () => {
      const [driverRes, templatesRes] = await Promise.all([
        supabase
          .from('drivers')
          .select('id')
          .eq('user_id', user!.id)
          .eq('org_id', orgId!)
          .maybeSingle(),
        supabase
          .from('document_templates')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('is_active', true),
      ]);

      const driverId = driverRes.data?.id ?? null;
      const activeTemplates = templatesRes.count ?? 0;

      if (!driverId || activeTemplates === 0) {
        return { needsOnboarding: false };
      }

      const { count: signedCount } = await supabase
        .from('driver_signed_documents')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('org_id', orgId!);

      return { needsOnboarding: (signedCount ?? 0) === 0 };
    },
  });

  if (loading || rolesLoading || orgLoading || (isDriver && !!orgId && onboardingLoading)) {
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
    if (driverOnboarding?.needsOnboarding) {
      return <Navigate to="/driver/onboarding" replace />;
    }
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
