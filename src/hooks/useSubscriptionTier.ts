import { useAuth, type SubscriptionTier } from '@/contexts/AuthContext';

export type { SubscriptionTier };

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  open_beta: [
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'agency_loads', 'carrier_vetting', 'commissions', 'crm', 'load_board',
    'insights',
  ],
  solo_bco: [
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
  ],
  fleet_owner: [
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
  ],
  agency: [
    'agency_loads', 'carrier_vetting', 'commissions', 'crm', 'load_board',
    'documents', 'insights',
  ],
  all_in_one: [
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'agency_loads', 'carrier_vetting', 'commissions', 'crm', 'load_board',
    'insights',
  ],
};

export function useSubscriptionTier() {
  const { subscriptionTier, orgId, loading } = useAuth();

  const tier = subscriptionTier;
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.solo_bco;
  const hasFeature = (feature: string) => features.includes(feature);

  return {
    org: orgId ? { id: orgId, subscription_tier: tier } : null,
    tier,
    features,
    hasFeature,
    isTrialActive: true,
    loading,
  };
}
