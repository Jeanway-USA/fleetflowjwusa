import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  CURRENT_TAX_YEAR,
  defaultTaxYearConfig,
  type TaxYearConfig,
} from '@/lib/payroll/taxTables';
import type { PayFrequency, StateTaxConfig } from '@/lib/payroll/types';
import { resolveState, STATE_CODES } from '@/lib/tax/states';

export interface TaxYearContext {
  orgId: string;
  config: TaxYearConfig;
  configId: string | null;
  statesByCode: Map<string, StateTaxConfig>;
  payFrequency: PayFrequency;
  defaultTaxState: string;
}

/**
 * Loads (and lazily seeds) the org's tax configuration for a given year.
 * The stored row is always the source of truth — code defaults only seed it.
 */
export function useTaxYearConfig(taxYear: number = CURRENT_TAX_YEAR) {
  const { orgId } = useAuth();

  return useQuery<TaxYearContext>({
    queryKey: ['tax_year_config', orgId, taxYear],
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: existing, error } = await supabase
        .from('tax_year_configs')
        .select('*')
        .eq('org_id', orgId!)
        .eq('tax_year', taxYear)
        .maybeSingle();
      if (error) throw error;

      let row: any = existing;
      if (!row) {
        // tables_year only exists in code: it is not a column.
        const { tables_year: _tablesYear, ...defaults } = defaultTaxYearConfig(taxYear);
        const { data: inserted, error: insErr } = await supabase
          .from('tax_year_configs')
          .insert({ org_id: orgId!, ...(defaults as any) })
          .select('*')
          .maybeSingle();
        if (insErr && insErr.code !== '23505') throw insErr;
        row = inserted ?? { ...defaults, id: null };
      }

      // Federal law is read from code (IRS Pub 15-T and Pub 15, 2026), never from the stored row, so an old
      // stored copy can not change what is withheld. Only the lock flag is read from the database.
      const config: TaxYearConfig = { ...defaultTaxYearConfig(taxYear), is_locked: !!row.is_locked };

      // Pay frequency + default state still live on payroll_settings.
      const { data: settings } = await supabase
        .from('payroll_settings')
        .select('pay_frequency, default_tax_state')
        .eq('org_id', orgId!)
        .maybeSingle();

      await supabase.rpc('seed_state_tax_configurations' as never, { _org_id: orgId! } as never);
      const { data: states } = await supabase
        .from('state_tax_configurations')
        .select('*')
        .eq('org_id', orgId!);

      // Every state is covered, even one the owner never opened: published wage bases and new-employer rates come from
      // the built-in table, and only an assigned rate the owner saved overrides the default.
      const savedByCode = new Map<string, any>((states ?? []).map((r: any) => [String(r.state_code).toUpperCase(), r]));
      const statesByCode = new Map<string, StateTaxConfig>();
      for (const code of STATE_CODES) {
        const r = resolveState(code, savedByCode.get(code));
        if (!r) continue;
        statesByCode.set(code, {
          state_code: code,
          suta_rate: r.sutaRate,
          suta_wage_base: r.sutaWageBase,
          has_state_income_tax: r.sitEstimateRate > 0,
          sit_rate: r.sitEstimateRate,
          rate_assumed: r.rateAssumed,
        });
      }

      return {
        orgId: orgId!,
        config,
        configId: row.id ?? null,
        statesByCode,
        payFrequency: ((settings as any)?.pay_frequency ?? 'weekly') as PayFrequency,
        defaultTaxState: (settings as any)?.default_tax_state ?? 'FL',
      };
    },
  });
}
