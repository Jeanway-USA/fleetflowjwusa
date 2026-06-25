import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SettlementDiscrepancy {
  id: string;
  org_id: string;
  load_id: string | null;
  settlement_id: string | null;
  trip_number: string | null;
  expected_amount: number;
  actual_amount: number;
  delta_amount: number;
  reason_code: string;
  detail: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function useLoadDiscrepancies(loadId: string | null | undefined) {
  return useQuery({
    queryKey: ['settlement-discrepancies', 'load', loadId],
    enabled: !!loadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlement_discrepancies')
        .select('*')
        .eq('load_id', loadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SettlementDiscrepancy[];
    },
    staleTime: 60_000,
  });
}

export function useSettlementDiscrepancies(settlementId: string | null | undefined) {
  return useQuery({
    queryKey: ['settlement-discrepancies', 'settlement', settlementId],
    enabled: !!settlementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlement_discrepancies')
        .select('*')
        .eq('settlement_id', settlementId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SettlementDiscrepancy[];
    },
    staleTime: 60_000,
  });
}

export function useUnresolvedDiscrepancyLoadIds() {
  return useQuery({
    queryKey: ['settlement-discrepancies', 'unresolved-load-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlement_discrepancies')
        .select('load_id')
        .is('resolved_at', null)
        .not('load_id', 'is', null);
      if (error) throw error;
      return new Set((data || []).map(r => r.load_id as string));
    },
    staleTime: 30_000,
  });
}
