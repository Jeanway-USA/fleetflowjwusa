import { supabase } from '@/integrations/supabase/client';
import { calculatePayrollTaxes } from '@/lib/payroll/taxEngine';
import { EMPTY_YTD, type PayeeTaxProfile, type PayeeYtd, type PayFrequency, type StateTaxConfig, type TaxYearConfig } from '@/lib/payroll/types';
import { classifyEmploymentType } from '@/lib/payroll/profiles';

/**
 * One list of everything the company has paid its people, whichever screen paid it.
 *
 * Employment taxes follow the day the money is paid, not the pay period. Pay for the last week of December that is paid
 * on January 3 belongs to the new year's W-2 and the new year's first quarter. \`payDate\` is that day.
 */

export type RecordSource = 'settlement' | 'payroll' | 'ledger' | 'staff';

export interface Amounts {
  /** Federal income tax withheld. */
  fit: number;
  ss: number;
  medicare: number;
  addlMedicare: number;
  /** State income tax withheld (box 17). */
  sit: number;
  /** Other state payroll programs withheld from the employee (Washington paid leave and WA Cares). */
  stateEmployeeOther: number;
  employerSs: number;
  employerMedicare: number;
  futa: number;
  suta: number;
  /** Other employer-paid state programs (Washington paid leave employer share). */
  stateEmployerOther: number;
}

export const ZERO_AMOUNTS: Amounts = { fit: 0, ss: 0, medicare: 0, addlMedicare: 0, sit: 0, stateEmployeeOther: 0, employerSs: 0, employerMedicare: 0, futa: 0, suta: 0, stateEmployerOther: 0 };

export interface PayRecord {
  id: string;
  source: RecordSource;
  payeeKey: string;
  payeeType: 'driver' | 'employee';
  payeeId: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  /** Taxable wages paid on this date. */
  wages: number;
  /** Reimbursements paid under an accountable plan. Never wages. */
  nonTaxable: number;
  amounts: Amounts;
  /** The state used for unemployment tax (where the worker is based). */
  stateCode: string | null;
  /** The state that taxes the worker's income. */
  sitStateCode: string | null;
  /** True when the tax figures were saved when the pay was made. False means they were calculated now. */
  recorded: boolean;
  notes: string[];
}

export interface Payee {
  key: string;
  type: 'driver' | 'employee';
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  /** 'w2' for people the hub reports on a W-2. */
  employmentClass: 'w2' | 'contractor';
  address: string | null;
  ssnLast4: string | null;
  hasW4: boolean;
  hasStateForm: boolean;
  hasI9: boolean;
  profile: PayeeTaxProfile;
  hireDate: string | null;
}

const n = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;
const dateOnly = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

/** Reads the tax figures out of a saved calculation (the lines the engine stored when the pay was made). */
export function amountsFromSnapshot(snapshot: any): { wages: number; amounts: Amounts } | null {
  const lines: any[] = Array.isArray(snapshot?.lines) ? snapshot.lines : [];
  if (lines.length === 0) return null;
  const get = (key: string, side: 'employee' | 'employer') => round2(lines.filter((l) => l.key === key && l.side === side).reduce((s, l) => s + n(l.amount), 0));
  const medicare = lines.find((l) => l.key === 'medicare' && l.side === 'employee');
  return {
    wages: n(medicare?.taxableWages),
    amounts: {
      fit: get('federal_income_tax', 'employee'),
      ss: get('social_security', 'employee'),
      medicare: get('medicare', 'employee'),
      addlMedicare: get('additional_medicare', 'employee'),
      sit: get('state_income_tax', 'employee'),
      stateEmployeeOther: round2(get('wa_pfml', 'employee') + get('wa_cares', 'employee')),
      employerSs: get('employer_social_security', 'employer'),
      employerMedicare: get('employer_medicare', 'employer'),
      futa: get('futa', 'employer'),
      suta: get('suta', 'employer'),
      stateEmployerOther: get('wa_pfml_employer', 'employer'),
    },
  };
}

export function amountsFromCalculation(result: ReturnType<typeof calculatePayrollTaxes>): Amounts {
  const e = (key: string) => round2(result.employeeLines.filter((l) => l.key === key).reduce((s, l) => s + l.amount, 0));
  const r = (key: string) => round2(result.employerLines.filter((l) => l.key === key).reduce((s, l) => s + l.amount, 0));
  return {
    fit: e('federal_income_tax'),
    ss: e('social_security'),
    medicare: e('medicare'),
    addlMedicare: e('additional_medicare'),
    sit: e('state_income_tax'),
    stateEmployeeOther: round2(e('wa_pfml') + e('wa_cares')),
    employerSs: r('employer_social_security'),
    employerMedicare: r('employer_medicare'),
    futa: r('futa'),
    suta: r('suta'),
    stateEmployerOther: r('wa_pfml_employer'),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------------------

export interface LoadedPayroll {
  payees: Payee[];
  records: PayRecord[];
}

const yearOf = (d: string) => Number(d.slice(0, 4));

/** Everyone who is paid on a W-2 basis, with the tax forms they filled in during onboarding. */
export async function loadPayees(orgId: string): Promise<Payee[]> {
  const [drivers, w4s, stateInfos, i9s, employees, eW4s, eState, eI9s] = await Promise.all([
    // Archived people stay in: wages already paid to them still belong on their W-2.
    supabase.from('drivers').select('id, first_name, last_name, status, employment_type, tax_state, hire_date, deleted_at').eq('org_id', orgId),
    supabase.from('driver_w4_info').select('*').eq('org_id', orgId),
    supabase.from('driver_state_tax_info').select('*').eq('org_id', orgId),
    supabase.from('driver_i9_info').select('driver_id, address, ssn_last4').eq('org_id', orgId),
    supabase.from('employees' as never).select('id, user_id, first_name, last_name, status, employment_type, tax_state, hire_date, address, archived_at').eq('org_id', orgId),
    supabase.from('employee_w4_info' as never).select('*').eq('org_id', orgId),
    supabase.from('employee_state_tax_info' as never).select('*').eq('org_id', orgId),
    supabase.from('employee_i9_info' as never).select('employee_id, address, ssn_last4').eq('org_id', orgId),
  ]);

  const by = (rows: any[] | null | undefined, key: string) => new Map<string, any>((rows ?? []).map((r) => [r[key], r]));
  const w4ByD = by(w4s.data, 'driver_id');
  const stByD = by(stateInfos.data, 'driver_id');
  const i9ByD = by(i9s.data, 'driver_id');
  const w4ByE = by(eW4s.data as any[], 'employee_id');
  const stByE = by(eState.data as any[], 'employee_id');
  const i9ByE = by(eI9s.data as any[], 'employee_id');

  const out: Payee[] = [];
  const normStatus = (s: unknown) => String(s ?? '').toLowerCase();
  const filing = (v: unknown): PayeeTaxProfile['filingStatus'] => {
    const s = String(v ?? '').toLowerCase().replace(/[\s-]/g, '_');
    return s.includes('joint') || s === 'married' ? 'married_joint' : s.includes('head') ? 'head_of_household' : 'single';
  };

  for (const d of (drivers.data ?? []) as any[]) {
    const w4 = w4ByD.get(d.id);
    const st = stByD.get(d.id);
    const i9 = i9ByD.get(d.id);
    const work = (st?.work_state ?? d.tax_state ?? null) || null;
    const residence = (st?.residence_state ?? d.tax_state ?? null) || null;
    const cls = classifyEmploymentType(d.employment_type);
    out.push({
      key: `driver:${d.id}`,
      type: 'driver',
      id: d.id,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      active: !d.deleted_at && (['active', 'onboarding', 'pending'].includes(normStatus(d.status)) || normStatus(d.status) === ''),
      employmentClass: cls,
      address: i9?.address ?? null,
      ssnLast4: i9?.ssn_last4 ?? null,
      hasW4: !!w4,
      hasStateForm: !!st,
      hasI9: !!i9,
      hireDate: d.hire_date ?? null,
      profile: {
        payeeId: d.id,
        payeeType: 'driver',
        name: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
        employmentClass: cls,
        filingStatus: filing(w4?.filing_status),
        multipleJobs: !!(w4?.multiple_jobs || w4?.step_2c_checkbox),
        dependentsAmount: n(w4?.dependents_amount),
        otherIncome: n(w4?.other_income),
        deductions: n(w4?.deductions),
        extraWithholding: n(w4?.extra_withholding),
        workState: work,
        residenceState: residence,
        // A driver who runs in two or more states is taxed on income only by the state they live in (49 U.S.C. 14503).
        sitState: residence ?? work,
        stateExempt: !!st?.exempt,
        stateAllowances: n(st?.allowances),
        stateAdditionalWithholding: n(st?.additional_withholding),
        usedDefaults: !w4,
      },
    });
  }

  for (const e of (employees.data ?? []) as any[]) {
    const w4 = w4ByE.get(e.id);
    const st = stByE.get(e.id);
    const i9 = i9ByE.get(e.id);
    const work = (st?.work_state ?? e.tax_state ?? null) || null;
    const residence = (st?.residence_state ?? e.tax_state ?? null) || null;
    out.push({
      key: `employee:${e.id}`,
      type: 'employee',
      id: e.id,
      firstName: e.first_name ?? '',
      lastName: e.last_name ?? '',
      active: !e.archived_at && normStatus(e.status) !== 'inactive',
      employmentClass: 'w2',
      address: i9?.address ?? e.address ?? null,
      ssnLast4: i9?.ssn_last4 ?? null,
      hasW4: !!w4,
      hasStateForm: !!st,
      hasI9: !!i9,
      hireDate: e.hire_date ?? null,
      profile: {
        payeeId: e.id,
        payeeType: 'employee',
        name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
        employmentClass: 'w2',
        filingStatus: filing(w4?.filing_status),
        multipleJobs: !!(w4?.multiple_jobs || w4?.step_2c_checkbox),
        dependentsAmount: n(w4?.dependents_amount),
        otherIncome: n(w4?.other_income),
        deductions: n(w4?.deductions),
        extraWithholding: n(w4?.extra_withholding),
        workState: work,
        residenceState: residence,
        // An office employee is taxed by the state where the work is done.
        sitState: work ?? residence,
        stateExempt: !!st?.exempt,
        stateAllowances: n(st?.allowances),
        stateAdditionalWithholding: n(st?.additional_withholding),
        usedDefaults: !w4,
      },
    });
  }
  return out;
}

/** Loads every pay record whose pay date falls in the calendar year. */
export async function loadPayRecords(orgId: string, year: number, payees: Payee[]): Promise<PayRecord[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const widen = `${year - 1}-12-01`; // pay dated early in the year can belong to a period that ended in December
  const empByUser = new Map<string, Payee>();
  const payeeById = new Map(payees.map((p) => [p.key, p]));

  const [{ data: employees }, settlements, payroll, ledger, staff] = await Promise.all([
    supabase.from('employees' as never).select('id, user_id').eq('org_id', orgId),
    supabase.from('driver_settlements').select('id, driver_id, period_start, period_end, payment_date, paid_at, status, gross_pay, reimbursements, tax_calculation').eq('org_id', orgId).is('deleted_at', null).eq('status', 'paid').gte('period_end', widen),
    supabase.from('driver_payroll').select('id, driver_id, period_start, period_end, payment_date, status, gross_pay, federal_income_tax, social_security_tax, medicare_tax, additional_medicare_tax, state_income_tax, employer_ss_tax, employer_medicare_tax, fl_suta_tax, tax_state, tax_calculation').eq('org_id', orgId).is('deleted_at', null).gte('period_end', widen),
    supabase.from('internal_payroll_ledger').select('id, driver_id, period_start, period_end, finalized_at, status, gross_taxable_pay, one_time_bonus, tax_calculation, tax_withholding_ledger (ee_social_security, er_social_security, ee_medicare, employer_medicare, additional_medicare, federal_income_withholding, state_sit, state_suta, tx_twc_unemployment, fl_reemployment, state_code)').eq('org_id', orgId).eq('status', 'finalized').gte('period_end', widen),
    supabase.from('staff_pay_statements' as never).select('id, user_id, period_start, period_end, paid_at, status, gross_pay, non_taxable').eq('org_id', orgId).eq('status', 'paid').is('archived_at', null).gte('period_end', widen),
  ]);

  for (const e of (employees ?? []) as any[]) {
    const p = payeeById.get(`employee:${e.id}`);
    if (p && e.user_id) empByUser.set(e.user_id, p);
  }

  const out: PayRecord[] = [];
  const inYear = (d: string) => d >= start && d <= end;
  const push = (r: PayRecord) => { if (inYear(r.payDate)) out.push(r); };

  for (const s of (settlements.data ?? []) as any[]) {
    const payee = payeeById.get(`driver:${s.driver_id}`);
    if (!payee || payee.employmentClass !== 'w2') continue;
    const payDate = dateOnly(s.payment_date) || dateOnly(s.paid_at) || dateOnly(s.period_end);
    const snap = amountsFromSnapshot(s.tax_calculation);
    const wages = snap?.wages || n(s.gross_pay);
    push({
      id: s.id, source: 'settlement', payeeKey: payee.key, payeeType: 'driver', payeeId: payee.id, payDate,
      periodStart: s.period_start, periodEnd: s.period_end, wages: round2(wages), nonTaxable: round2(n(s.reimbursements)),
      amounts: snap?.amounts ?? { ...ZERO_AMOUNTS }, stateCode: s.tax_calculation?.profile?.workState ?? payee.profile.workState, sitStateCode: s.tax_calculation?.profile?.sitState ?? payee.profile.sitState ?? null,
      recorded: !!snap, notes: [],
    });
  }

  for (const p of (payroll.data ?? []) as any[]) {
    const payee = payeeById.get(`driver:${p.driver_id}`);
    if (!payee || payee.employmentClass !== 'w2' || ['draft', 'void', 'voided', 'cancelled'].includes(String(p.status).toLowerCase())) continue;
    const snap = amountsFromSnapshot(p.tax_calculation);
    const payDate = dateOnly(p.payment_date) || dateOnly(p.period_end);
    push({
      id: p.id, source: 'payroll', payeeKey: payee.key, payeeType: 'driver', payeeId: payee.id, payDate,
      periodStart: p.period_start, periodEnd: p.period_end, wages: round2(snap?.wages || n(p.gross_pay)), nonTaxable: 0,
      amounts: snap?.amounts ?? {
        ...ZERO_AMOUNTS, fit: n(p.federal_income_tax), ss: n(p.social_security_tax), medicare: n(p.medicare_tax), addlMedicare: n(p.additional_medicare_tax),
        sit: n(p.state_income_tax), employerSs: n(p.employer_ss_tax), employerMedicare: n(p.employer_medicare_tax), suta: n(p.fl_suta_tax),
      },
      stateCode: p.tax_state ?? payee.profile.workState, sitStateCode: payee.profile.sitState ?? null, recorded: true, notes: [],
    });
  }

  for (const l of (ledger.data ?? []) as any[]) {
    const payee = payeeById.get(`driver:${l.driver_id}`);
    if (!payee) continue;
    const wh = Array.isArray(l.tax_withholding_ledger) ? l.tax_withholding_ledger[0] : l.tax_withholding_ledger;
    const snap = amountsFromSnapshot(l.tax_calculation);
    const payDate = dateOnly(l.finalized_at) || dateOnly(l.period_end);
    const fallbackWages = n(l.gross_taxable_pay) + n(l.one_time_bonus);
    push({
      id: l.id, source: 'ledger', payeeKey: payee.key, payeeType: 'driver', payeeId: payee.id, payDate,
      periodStart: l.period_start, periodEnd: l.period_end, wages: round2(snap?.wages || fallbackWages), nonTaxable: 0,
      amounts: snap?.amounts ?? {
        ...ZERO_AMOUNTS, fit: n(wh?.federal_income_withholding), ss: n(wh?.ee_social_security), medicare: n(wh?.ee_medicare), addlMedicare: n(wh?.additional_medicare),
        sit: n(wh?.state_sit), employerSs: n(wh?.er_social_security), employerMedicare: n(wh?.employer_medicare),
        suta: n(wh?.state_suta) || n(wh?.tx_twc_unemployment) + n(wh?.fl_reemployment),
      },
      stateCode: wh?.state_code ?? payee.profile.workState, sitStateCode: payee.profile.sitState ?? null, recorded: true, notes: [],
    });
  }

  for (const s of (staff.data ?? []) as any[]) {
    const payee = empByUser.get(s.user_id);
    if (!payee) continue;
    // Staff pay statements carry no tax figures: the hub works them out (see applyEngineToUnrecorded).
    push({
      id: s.id, source: 'staff', payeeKey: payee.key, payeeType: 'employee', payeeId: payee.id,
      payDate: dateOnly(s.paid_at) || dateOnly(s.period_end), periodStart: s.period_start, periodEnd: s.period_end,
      wages: round2(n(s.gross_pay)), nonTaxable: round2(n(s.non_taxable)), amounts: { ...ZERO_AMOUNTS },
      stateCode: payee.profile.workState, sitStateCode: payee.profile.sitState ?? null, recorded: false, notes: [],
    });
  }

  return out.sort((a, b) => a.payDate.localeCompare(b.payDate) || a.id.localeCompare(b.id));
}

/**
 * Fills in tax figures for any pay record that has none saved, running the shared tax engine in pay-date order with
 * each person's running year-to-date. Records that already carry saved figures are left alone: those are what was
 * actually withheld.
 */
export function applyEngineToUnrecorded(
  records: PayRecord[],
  payees: Payee[],
  ctx: { config: TaxYearConfig; statesByCode: Map<string, StateTaxConfig>; payFrequency: PayFrequency; headcount: number },
): PayRecord[] {
  const byKey = new Map(payees.map((p) => [p.key, p]));
  const ytd = new Map<string, PayeeYtd>();
  const get = (k: string) => { if (!ytd.has(k)) ytd.set(k, { ...EMPTY_YTD }); return ytd.get(k)!; };

  return records.map((r) => {
    const y = get(r.payeeKey);
    const payee = byKey.get(r.payeeKey);
    let next = r;
    if (!r.recorded && payee && payee.employmentClass === 'w2' && r.wages > 0) {
      const state = (r.stateCode && ctx.statesByCode.get(r.stateCode.toUpperCase())) || null;
      const result = calculatePayrollTaxes({
        grossTaxablePay: r.wages, profile: payee.profile, config: ctx.config, state, ytd: { ...y },
        payFrequency: ctx.payFrequency, sitStateCode: r.sitStateCode, sitStateConfig: (r.sitStateCode && ctx.statesByCode.get(r.sitStateCode.toUpperCase())) || null, employerHeadcount: ctx.headcount,
      });
      next = { ...r, amounts: amountsFromCalculation(result), notes: [...r.notes, 'Taxes calculated by the Tax Hub: no withholding was saved with this pay.', ...(result.warnings ?? [])] };
    }
    y.gross += next.wages;
    y.socialSecurityWages += next.wages;
    y.medicareWages += next.wages;
    return next;
  });
}

export { yearOf };
