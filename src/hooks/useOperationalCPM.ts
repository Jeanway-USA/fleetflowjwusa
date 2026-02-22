import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_CPM = 1.75;

export function useOperationalCPM() {
  const { data: cpm, isLoading } = useQuery({
    queryKey: ['operational-cpm'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('setting_value')
        .eq('setting_key', 'operational_cpm')
        .maybeSingle();

      return data ? parseFloat(data.setting_value) || DEFAULT_CPM : DEFAULT_CPM;
    },
    staleTime: 10 * 60 * 1000,
  });

  const costPerMile = cpm ?? DEFAULT_CPM;

  const calculateTrueProfit = (grossRevenue: number, miles: number) => {
    const operationalCost = costPerMile * miles;
    const trueProfit = grossRevenue - operationalCost;
    const margin = grossRevenue > 0 ? (trueProfit / grossRevenue) * 100 : 0;
    return { operationalCost, trueProfit, margin };
  };

  return { costPerMile, isLoading, calculateTrueProfit };
}
