import { supabase } from '@/integrations/supabase/client';
import { calculatePayrollTaxes } from '@/lib/payroll/taxEngine';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD, type PayeeYtd, type PayFrequency, type StateTaxConfig, type TaxYearConfig } from '@/lib/payroll/types';
import { loadPayees, type Payee } from '@/lib/tax/records';
import { applyPlansToPay } from '@/lib/payroll/deductionPlans';
import type { AppliedDeduction, DeductionPlan } from '@/lib/payroll/deductions';
import { resolveState, STATE_CODES } from '@/lib/tax/states';

const db = supabase as any;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Staff pay statements used to show pay before taxes, so nothing was withheld from an office employee's pay. This works
 * out their taxes with the same engine drivers and the Tax Hub use, from the W-4 and state form they filled in at onboarding.
 */

export interface StaffTaxContext {
  payees: Payee[];
  statesByCode: Map<string, StateTaxConfig>;
  payFrequency: PayFrequency;
  /** The state used for a person with no state of their own. */
  defaultTaxState: string;
  headcount: number;
}

export async function loadStaffTaxContext(orgId: string): Promise<StaffTaxContext> {
  const [payees, saved, settings] = await Promise.all([
    loadPayees(orgId),
    db.from('state_tax_configurations').select('state_code, suta_rate, sit_rate, has_state_income_tax').eq('org_id', orgId),
    db.from('payroll_settings').select('pay_frequency, default_tax_state').eq('org_id', orgId).maybeSingle(),
  ]);
  const savedByCode = new Map<string, any>(((saved.data ?? []) as any[]).map((r) => [String(r.state_code).toUpperCase(), r]));
  const statesByCode = new Map<string, StateTaxConfig>();
  for (const code of STATE_CODES) {
    const r = resolveState(code, savedByCode.get(code));
    if (r) statesByCode.set(code, { state_code: code, suta_rate: r.sutaRate, suta_wage_base: r.sutaWageBase, has_state_income_tax: r.sitEstimateRate > 0, sit_rate: r.sitEstimateRate, rate_assumed: r.rateAssumed });
  }
  return {
    payees,
    statesByCode,
    payFrequency: ((settings.data?.pay_frequency as PayFrequency | undefined) ?? 'weekly'),
    defaultTaxState: (settings.data?.default_tax_state as string | undefined) ?? 'FL',
    headcount: payees.filter((p) => p.employmentClass === 'w2' && p.active).length,
  };
}

/** The person (employee record with their onboarding forms) behind a login. */
export function employeeForUser(ctx: StaffTaxContext, userId: string): Payee | null {
  return ctx.payees.find((p) => p.type === 'employee' && p.userId === userId) ?? null;
}

/** Year-to-date for a staff member: the statements already approved or paid in the tax year before this one. */
export async function staffYtd(orgId: string, userId: string, year: number, beforePeriodEnd: string): Promise<PayeeYtd> {
  const { data } = await db
    .from('staff_pay_statements')
    .select('gross_pay, period_end, status')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .in('status', ['approved', 'paid'])
    .gte('period_end', `${year}-01-01`)
    .lt('period_end', beforePeriodEnd);
  const wages = ((data ?? []) as any[]).reduce((s, r) => s + (Number(r.gross_pay) || 0), 0);
  return { ...EMPTY_YTD, gross: wages, socialSecurityWages: wages, medicareWages: wages };
}

export interface StaffTaxResult {
  taxWithholding: number;
  /** Net take-home: taxable pay and reimbursements, less deductions and the taxes withheld. */
  netPay: number;
  /** The saved calculation (the lines the Tax Hub reads). */
  calculation: unknown;
  warnings: string[];
  /** What the person's standing deduction plans took, and the total. Net pay already has it taken off. */
  applied: AppliedDeduction[];
  planTotal: number;
}

/** Pure: the taxes and net pay for one staff statement. */
export function staffTaxesFor(args: {
  payee: Payee | null;
  taxableGross: number;
  nonTaxable: number;
  deductions: number;
  config: TaxYearConfig;
  ctx: StaffTaxContext;
  ytd: PayeeYtd;
  /** Off-cycle pay: income tax at the flat supplemental rate. */
  supplemental?: boolean;
  /** Standing deductions (insurance, 401(k), garnishments, loans) and the pay date they are checked against. */
  plans?: DeductionPlan[];
  payDate?: string;
}): StaffTaxResult {
  const { payee, taxableGross, nonTaxable, deductions, config, ctx, ytd, supplemental } = args;
  const plans = args.plans ?? [];
  const payDate = args.payDate ?? '9999-12-31';
  if (!payee) {
    // No employee record means no W-4 and no state: withhold as single with no adjustments and say so.
    const out = applyPlansToPay({ gross: taxableGross, nonTaxable, otherDeductions: deductions, payDate, frequency: ctx.payFrequency, plans, calc: (preTax, other) => calculatePayrollTaxes({
      grossTaxablePay: taxableGross,
      otherDeductions: other,
      preTax,
      profile: {
        payeeId: 'unknown', payeeType: 'employee', name: 'Unknown', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0,
        workState: null, residenceState: null, sitState: null, stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: true,
      },
      config, state: null, ytd, payFrequency: ctx.payFrequency, employerHeadcount: ctx.headcount, supplemental,
    }) });
    const result = out.result;
    return { taxWithholding: result.totalEmployeeWithholding, netPay: round2(taxableGross + nonTaxable - deductions - out.planTotal - result.totalEmployeeWithholding), calculation: result.audit, warnings: ['No employee tax record found for this person: federal tax was withheld as single with no adjustments.', ...(result.warnings ?? []), ...out.warnings], applied: out.applied, planTotal: out.planTotal };
  }
  const work = (payee.profile.workState ?? '').toUpperCase();
  const sit = (payee.profile.sitState ?? '').toUpperCase();
  const out = applyPlansToPay({ gross: taxableGross, nonTaxable, otherDeductions: deductions, payDate, frequency: ctx.payFrequency, plans, calc: (preTax, other) => calculatePayrollTaxes({
    grossTaxablePay: taxableGross,
    otherDeductions: other,
    preTax,
    profile: payee.profile,
    config,
    state: work ? ctx.statesByCode.get(work) ?? null : null,
    sitStateCode: sit || null,
    sitStateConfig: sit ? ctx.statesByCode.get(sit) ?? null : null,
    ytd,
    payFrequency: ctx.payFrequency,
    employerHeadcount: ctx.headcount,
    supplemental,
  }) });
  const result = out.result;
  return {
    taxWithholding: result.totalEmployeeWithholding,
    netPay: round2(taxableGross + nonTaxable - deductions - out.planTotal - result.totalEmployeeWithholding),
    calculation: JSON.parse(JSON.stringify(result.audit)),
    warnings: [...(result.warnings ?? []), ...out.warnings],
    applied: out.applied,
    planTotal: out.planTotal,
  };
}

export { defaultTaxYearConfig };
