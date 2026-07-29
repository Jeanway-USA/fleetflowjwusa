import { supabase } from '@/integrations/supabase/client';
import { EMPTY_YTD, type PayeeYtd } from './types';

/**
 * One YTD source of truth.
 *
 * Unions W-2 payroll runs (`driver_payroll`) and settlements
 * (`driver_settlements`) for the tax year so wage-base caps, pay stubs and
 * employer liability reports can never disagree with each other.
 */
export async function loadYtdByDriver(
  orgId: string,
  taxYear: number,
  before?: string,
): Promise<Map<string, PayeeYtd>> {
  const yearStart = `${taxYear}-01-01`;
  const cutoff = before ?? `${taxYear}-12-31`;

  const [{ data: payroll }, { data: settlements }] = await Promise.all([
    supabase
      .from('driver_payroll')
      .select(
        'driver_id, gross_pay, federal_income_tax, social_security_tax, medicare_tax, additional_medicare_tax, state_income_tax, net_pay, period_end',
      )
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('period_end', yearStart)
      .lt('period_end', cutoff),
    supabase
      .from('driver_settlements')
      .select('driver_id, gross_pay, tax_withholding, net_pay, period_end, tax_calculation')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('period_end', yearStart)
      .lt('period_end', cutoff),
  ]);

  const map = new Map<string, PayeeYtd>();
  const get = (id: string): PayeeYtd => {
    if (!map.has(id)) map.set(id, { ...EMPTY_YTD });
    return map.get(id)!;
  };

  for (const r of (payroll ?? []) as any[]) {
    const y = get(r.driver_id);
    const gross = Number(r.gross_pay) || 0;
    y.gross += gross;
    y.socialSecurityWages += gross;
    y.medicareWages += gross;
    y.federalIncomeTax += Number(r.federal_income_tax) || 0;
    y.socialSecurityTax += Number(r.social_security_tax) || 0;
    y.medicareTax += Number(r.medicare_tax) || 0;
    y.additionalMedicareTax += Number(r.additional_medicare_tax) || 0;
    y.stateIncomeTax += Number(r.state_income_tax) || 0;
    y.net += Number(r.net_pay) || 0;
  }

  for (const r of (settlements ?? []) as any[]) {
    const y = get(r.driver_id);
    const gross = Number(r.gross_pay) || 0;
    const calc = r.tax_calculation as any | null;
    const isW2 = calc?.employmentClass === 'w2';
    y.gross += gross;
    y.net += Number(r.net_pay) || 0;
    if (!isW2) continue;
    y.socialSecurityWages += gross;
    y.medicareWages += gross;
    const lines: any[] = Array.isArray(calc?.lines) ? calc.lines : [];
    const amt = (key: string) =>
      Number(lines.find((l) => l.key === key && l.side === 'employee')?.amount) || 0;
    y.federalIncomeTax += amt('federal_income_tax');
    y.socialSecurityTax += amt('social_security');
    y.medicareTax += amt('medicare');
    y.additionalMedicareTax += amt('additional_medicare');
    y.stateIncomeTax += amt('state_income_tax');
  }

  return map;
}
