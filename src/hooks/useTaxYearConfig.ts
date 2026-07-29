import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  CURRENT_TAX_YEAR,
  defaultTaxYearConfig,
  type TaxYearConfig,
} from '@/lib/payroll/taxTables';
import type { PayFrequency, StateTaxConfig } from '@/lib/payroll/types';

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
        const defaults = defaultTaxYearConfig(taxYear);
        const { data: inserted, error: insErr } = await supabase
          .from('tax_year_configs')
          .insert({ org_id: orgId!, ...(defaults as any) })
          .select('*')
          .maybeSingle();
        if (insErr && insErr.code !== '23505') throw insErr;
        row = inserted ?? { ...defaults, id: null };
      }

      const config: TaxYearConfig = {
        tax_year: row.tax_year,
        fit_tables: row.fit_tables,
        fit_tables_multiple_jobs: row.fit_tables_multiple_jobs,
        standard_deduction: row.standard_deduction,
        dependent_credit_qualifying_child: Number(row.dependent_credit_qualifying_child),
        dependent_credit_other: Number(row.dependent_credit_other),
        social_security_rate: Number(row.social_security_rate),
        social_security_wage_base: Number(row.social_security_wage_base),
        medicare_rate: Number(row.medicare_rate),
        additional_medicare_rate: Number(row.additional_medicare_rate),
        additional_medicare_threshold: Number(row.additional_medicare_threshold),
        futa_rate: Number(row.futa_rate),
        futa_wage_base: Number(row.futa_wage_base),
        is_locked: !!row.is_locked,
      };

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

      const statesByCode = new Map<string, StateTaxConfig>();
      for (const s of (states ?? []) as any[]) {
        statesByCode.set(s.state_code, {
          state_code: s.state_code,
          suta_rate: Number(s.suta_rate) || 0,
          suta_wage_base: Number(s.suta_wage_base) || 0,
          has_state_income_tax: !!s.has_state_income_tax,
          sit_rate: Number(s.sit_rate) || 0,
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
