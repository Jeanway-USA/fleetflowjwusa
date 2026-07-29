import { supabase } from '@/integrations/supabase/client';
import type { FilingStatus } from './taxTables';
import type { EmploymentClass, PayeeTaxProfile } from './types';

function normalizeFilingStatus(v: unknown): FilingStatus {
  const s = String(v ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (s.includes('joint') || s === 'married') return 'married_joint';
  if (s.includes('head')) return 'head_of_household';
  return 'single';
}

export function classifyEmploymentType(employmentType: unknown): EmploymentClass {
  const s = String(employmentType ?? '').toLowerCase();
  if (s.includes('w2') || s.includes('w-2') || s === 'employee' || s === 'company_driver') {
    return 'w2';
  }
  return 'contractor';
}

/**
 * Resolves the tax profile for a set of drivers.
 *
 * Deliberately keyed on a generic payee shape: adding non-driver employees
 * later only requires a second resolver that returns `PayeeTaxProfile`s —
 * the engine, ledger and reporting stay untouched.
 */
export async function resolveDriverTaxProfiles(
  orgId: string,
  driverIds?: string[],
): Promise<Map<string, PayeeTaxProfile>> {
  let driverQuery = supabase
    .from('drivers')
    .select('id, first_name, last_name, employment_type, tax_state, state')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (driverIds?.length) driverQuery = driverQuery.in('id', driverIds);

  const [{ data: drivers }, { data: w4s }, { data: stateInfos }] = await Promise.all([
    driverQuery,
    supabase.from('driver_w4_info').select('*').eq('org_id', orgId),
    supabase.from('driver_state_tax_info').select('*').eq('org_id', orgId),
  ]);

  const w4ById = new Map<string, any>();
  (w4s ?? []).forEach((r: any) => w4ById.set(r.driver_id, r));
  const stateById = new Map<string, any>();
  (stateInfos ?? []).forEach((r: any) => stateById.set(r.driver_id, r));

  const out = new Map<string, PayeeTaxProfile>();
  for (const d of (drivers ?? []) as any[]) {
    const w4 = w4ById.get(d.id);
    const st = stateById.get(d.id);
    out.set(d.id, {
      payeeId: d.id,
      payeeType: 'driver',
      name: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
      employmentClass: classifyEmploymentType(d.employment_type),
      filingStatus: normalizeFilingStatus(w4?.filing_status),
      multipleJobs: !!(w4?.multiple_jobs || w4?.step_2c_checkbox),
      dependentsAmount: Number(w4?.dependents_amount) || 0,
      otherIncome: Number(w4?.other_income) || 0,
      deductions: Number(w4?.deductions) || 0,
      extraWithholding: Number(w4?.extra_withholding) || 0,
      workState: (st?.work_state ?? d.tax_state ?? d.state ?? null) || null,
      residenceState: (st?.residence_state ?? d.state ?? null) || null,
      stateExempt: !!st?.exempt,
      stateAllowances: Number(st?.allowances) || 0,
      stateAdditionalWithholding: Number(st?.additional_withholding) || 0,
      usedDefaults: !w4,
    });
  }
  return out;
}
