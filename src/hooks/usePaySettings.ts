import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import type { PaySettings } from '@/utils/payCalculations';

const DEFAULT_LANDSTAR_SPLIT = 0.65;

/**
 * Returns the org-level settings consumed by `calculateLoadPay` /
 * `calculateWeeklyPay`. Centralises the lookup so every caller agrees
 * on the Landstar truck split and TMS mode.
 */
export function usePaySettings(): PaySettings {
  const { tmsMode } = useOrganizationMode();

  const { data: split } = useQuery({
    queryKey: ['pay-settings-landstar-split'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('setting_value')
        .eq('setting_key', 'truck_percentage')
        .maybeSingle();
      if (error) throw error;
      const raw = parseFloat(data?.setting_value ?? '');
      if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LANDSTAR_SPLIT;
      // Stored as either 65 or 0.65 — normalise to a fraction.
      return raw > 1 ? raw / 100 : raw;
    },
    staleTime: 10 * 60 * 1000,
  });

  return {
    tmsMode,
    landstarSplit: split ?? DEFAULT_LANDSTAR_SPLIT,
  };
}
