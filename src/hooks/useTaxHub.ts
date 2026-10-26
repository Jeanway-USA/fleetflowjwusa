import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployerInfo } from '@/hooks/useTaxHubData';
import { useTaxYearConfig } from '@/hooks/useTaxYearConfig';
import { loadPayees, loadPayRecords } from '@/lib/tax/records';
import { assembleTaxHub, type SavedStateRow } from '@/lib/tax/hub';

export type { SavedStateRow };

/** Loads the people, their pay records (three years, so the deposit schedule's lookback is honest) and the saved state settings. */
export function useTaxHub(year: number) {
  const { orgId } = useAuth();
  const ctx = useTaxYearConfig(year);
  const employer = useEmployerInfo();

  const payeesQ = useQuery({ queryKey: ['taxhub-payees', orgId], enabled: !!orgId, queryFn: () => loadPayees(orgId!) });

  const savedQ = useQuery({
    queryKey: ['taxhub-saved-states', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SavedStateRow[]> => {
      const { data, error } = await supabase.from('state_tax_configurations' as never).select('*').eq('org_id', orgId!);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        code: String(r.state_code).toUpperCase(), suta_rate: Number(r.suta_rate) || 0, sit_rate: Number(r.sit_rate) || 0, has_state_income_tax: !!r.has_state_income_tax,
        suta_account_number: r.suta_account_number ?? null, sit_account_number: r.sit_account_number ?? null, deposit_frequency: r.deposit_frequency ?? null, agency_notes: r.agency_notes ?? null,
      }));
    },
  });

  const recordsQ = useQuery({
    queryKey: ['taxhub-records', orgId, year],
    enabled: !!orgId && !!payeesQ.data,
    queryFn: async () => {
      const years = [year - 2, year - 1, year];
      const lists = await Promise.all(years.map((y) => loadPayRecords(orgId!, y, payeesQ.data!)));
      return years.map((y, i) => ({ year: y, records: lists[i] }));
    },
  });

  const derived = useMemo(() => {
    if (!payeesQ.data || !recordsQ.data || !ctx.data) return null;
    return assembleTaxHub({ year, payees: payeesQ.data, recordsByYear: recordsQ.data, config: ctx.data.config, statesByCode: ctx.data.statesByCode, payFrequency: ctx.data.payFrequency, saved: savedQ.data ?? [], employer: employer.data });
  }, [payeesQ.data, recordsQ.data, ctx.data, savedQ.data, employer.data, year]);

  return {
    data: derived,
    ctx: ctx.data,
    employer: employer.data,
    saved: savedQ.data ?? [],
    isLoading: payeesQ.isLoading || recordsQ.isLoading || ctx.isLoading,
    error: (payeesQ.error || recordsQ.error || ctx.error) as Error | null,
  };
}
