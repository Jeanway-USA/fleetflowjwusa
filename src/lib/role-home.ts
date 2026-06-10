import type { Database } from '@/integrations/supabase/types';
import type { SubscriptionTier } from '@/contexts/AuthContext';

export type AppRole = Database['public']['Enums']['app_role'];

/**
 * Single source of truth for "where does this user belong?"
 * Used by RoleBasedRedirect (root) and ProtectedRoute (access-denied fallback).
 */
export function getRoleHomePath(
  roles: AppRole[],
  subscriptionTier: SubscriptionTier,
): string {
  const has = (r: AppRole) => roles.includes(r);

  if (has('owner')) {
    switch (subscriptionTier) {
      case 'solo_bco':
      case 'open_beta':
        return '/fleet-loads';
      case 'agency':
        return '/agency-loads';
      case 'fleet_owner':
      case 'all_in_one':
      default:
        return '/executive-dashboard';
    }
  }
  if (has('dispatcher')) return '/dispatcher-dashboard';
  if (has('driver')) return '/driver-dashboard';
  if (has('maintenance')) return '/maintenance-home';
  if (has('safety') || has('payroll_admin')) return '/executive-dashboard';
  return '/pending-access';
}
