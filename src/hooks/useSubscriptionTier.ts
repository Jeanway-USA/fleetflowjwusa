import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type SubscriptionTier = 'solo_bco' | 'fleet_owner' | 'agency' | 'all_in_one';

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
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

interface OrgData {
  id: string;
  name: string;
  subscription_tier: SubscriptionTier;
  trial_ends_at: string | null;
  is_active: boolean;
}

export function useSubscriptionTier() {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrg(null);
      setLoading(false);
      return;
    }

    const fetchOrg = async () => {
      // Get org_id from profile, then fetch org
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (profile?.org_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profile.org_id)
          .single();

        if (orgData) {
          setOrg(orgData as unknown as OrgData);
        }
      }
      setLoading(false);
    };

    fetchOrg();
  }, [user]);

  const tier = org?.subscription_tier ?? 'solo_bco';
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.solo_bco;

  const hasFeature = (feature: string) => features.includes(feature);

  const isTrialActive = org?.trial_ends_at
    ? new Date(org.trial_ends_at) > new Date()
    : true; // No trial_ends_at means no trial limit (e.g. JeanWay)

  return {
    org,
    tier,
    features,
    hasFeature,
    isTrialActive,
    loading,
  };
}
