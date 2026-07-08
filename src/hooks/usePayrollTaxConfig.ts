import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PAYROLL_TAX_CONFIG, type PayrollTaxConfig } from '@/utils/payCalculations';

const KEYS = ['ss_wage_base', 'ss_rate', 'medicare_rate', 'tx_sui_rate'];

export function usePayrollTaxConfig() {
  const { orgId } = useAuth();

  return useQuery<PayrollTaxConfig>({
    queryKey: ['payroll_tax_config', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .eq('org_id', orgId!)
        .in('setting_key', KEYS);

      const map = new Map<string, string>();
      (data ?? []).forEach((r) => map.set(r.setting_key, r.setting_value));

      const num = (k: string, fallback: number) => {
        const v = map.get(k);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : fallback;
      };

      return {
        ssWageBase: num('ss_wage_base', DEFAULT_PAYROLL_TAX_CONFIG.ssWageBase),
        ssRate: num('ss_rate', DEFAULT_PAYROLL_TAX_CONFIG.ssRate),
        medicareRate: num('medicare_rate', DEFAULT_PAYROLL_TAX_CONFIG.medicareRate),
        txSuiRate: num('tx_sui_rate', DEFAULT_PAYROLL_TAX_CONFIG.txSuiRate),
      };
    },
  });
}
