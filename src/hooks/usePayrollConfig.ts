import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type {
  W2FederalConfig,
  W2StateConfig,
  PayFrequency,
} from '@/utils/payCalculations';

export interface PayrollConfigResult {
  federal: W2FederalConfig;
  statesByCode: Map<string, W2StateConfig>;
  defaultTaxState: string;
}

/**
 * Loads the org's payroll_settings row (federal defaults + FIT brackets)
 * and all per-state tax configurations. Ensures the state table is seeded.
 */
export function usePayrollConfig() {
  const { orgId } = useAuth();

  return useQuery<PayrollConfigResult>({
    queryKey: ['payroll_config', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: settings, error } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!settings) throw new Error('Payroll settings not initialized for this org.');

      // Ensure state tax configurations exist (idempotent seeder).
      await supabase.rpc('seed_state_tax_configurations' as never, {
        _org_id: orgId!,
      } as never);

      const { data: states } = await supabase
        .from('state_tax_configurations' as never)
        .select('*')
        .eq('org_id', orgId!);

      const federal: W2FederalConfig = {
        social_security_rate: Number((settings as any).social_security_rate),
        social_security_wage_base: Number((settings as any).social_security_wage_base),
        medicare_rate: Number((settings as any).medicare_rate),
        additional_medicare_rate: Number((settings as any).additional_medicare_rate),
        additional_medicare_threshold: Number((settings as any).additional_medicare_threshold),
        pay_frequency: ((settings as any).pay_frequency ?? 'weekly') as PayFrequency,
        fit_brackets: (settings as any).fit_brackets,
        standard_deduction: (settings as any).standard_deduction,
      };

      const map = new Map<string, W2StateConfig>();
      for (const r of (states ?? []) as any[]) {
        map.set(r.state_code, {
          state_code: r.state_code,
          suta_rate: Number(r.suta_rate) || 0,
          suta_wage_base: Number(r.suta_wage_base) || 0,
          has_state_income_tax: !!r.has_state_income_tax,
          sit_rate: Number(r.sit_rate) || 0,
        });
      }

      return {
        federal,
        statesByCode: map,
        defaultTaxState: (settings as any).default_tax_state ?? 'FL',
      };
    },
  });
}
