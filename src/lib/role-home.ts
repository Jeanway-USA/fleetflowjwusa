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

  // Post-teardown: 'admin' is the consolidated internal staff role.
  if (has('admin') || has('owner') || has('payroll_admin') || has('safety')) {
    return '/executive-dashboard';
  }
  if (has('dispatcher')) return '/dispatcher-dashboard';
  if (has('driver')) return '/driver-dashboard';
  if (has('maintenance')) return '/maintenance-home';
  // No role yet — send to auth rather than a dead pending-access page.
  return '/auth';
}
