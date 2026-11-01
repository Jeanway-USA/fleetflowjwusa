import type { PayFrequency } from '@/lib/payroll/types';

/**
 * Payroll deductions: what comes out of pay besides tax, and what each one does to taxes and the W-2.
 *
 * Before tax (they lower the pay that tax is figured on):
 *  - Health, dental and vision premiums, HSA and FSA contributions paid through a cafeteria plan (Section 125): free of
 *    income tax, Social Security, Medicare and unemployment tax.
 *  - Traditional 401(k) contributions: free of income tax only. Social Security, Medicare and unemployment tax still apply.
 * After tax: Roth 401(k), garnishments, tax levies, advances, loans, escrow and the rest.
 *
 * Federal limits are for 2026 (IRS Notice 2025-67; the 2026 W-2 instructions; the One Big Beautiful Bill for dependent care).
 * State income tax follows the federal treatment here. A few states do not (for example Pennsylvania and New Jersey tax 401(k)
 * contributions): those need a manual check, which the Tax Hub flags for any state whose income tax is not automatic.
 */

export type DeductionKind =
  | 'health_insurance'
  | 'dental_insurance'
  | 'vision_insurance'
  | 'hsa'
  | 'fsa_health'
  | 'fsa_dependent_care'
  | 'retirement_pretax'
  | 'retirement_roth'
  | 'garnish_child_support'
  | 'tax_levy'
  | 'garnish_student_loan'
  | 'garnish_creditor'
  | 'advance'
  | 'loan'
  | 'escrow'
  | 'other_after_tax';

export interface KindInfo {
  label: string;
  group: 'benefit' | 'retirement' | 'garnishment' | 'after_tax';
  /** Which tax bases this deduction lowers when it comes out before tax. */
  lowers: { fit: boolean; fica: boolean; futa: boolean; state: boolean };
  /** W-2 box 12 code for the employee's amount, when there is one. */
  w2Box12?: string;
  /** The default order a person's after-tax deductions are taken in (lower first). */
  priority: number;
  /** A yearly limit for the employee's contributions in 2026, when one applies. */
  annualLimit?: number;
}

const NONE = { fit: false, fica: false, futa: false, state: false };
const SECTION_125 = { fit: true, fica: true, futa: true, state: true };

export const KINDS: Record<DeductionKind, KindInfo> = {
  health_insurance: { label: 'Health insurance', group: 'benefit', lowers: SECTION_125, priority: 10 },
  dental_insurance: { label: 'Dental insurance', group: 'benefit', lowers: SECTION_125, priority: 10 },
  vision_insurance: { label: 'Vision insurance', group: 'benefit', lowers: SECTION_125, priority: 10 },
  hsa: { label: 'Health savings account (HSA)', group: 'benefit', lowers: SECTION_125, w2Box12: 'W', priority: 10, annualLimit: 4400 },
  fsa_health: { label: 'Health flexible spending (FSA)', group: 'benefit', lowers: SECTION_125, priority: 10, annualLimit: 3400 },
  fsa_dependent_care: { label: 'Dependent care FSA', group: 'benefit', lowers: SECTION_125, priority: 10, annualLimit: 7500 },
  retirement_pretax: { label: '401(k), traditional (before tax)', group: 'retirement', lowers: { fit: true, fica: false, futa: false, state: true }, w2Box12: 'D', priority: 11, annualLimit: 24500 },
  retirement_roth: { label: '401(k), Roth (after tax)', group: 'retirement', lowers: NONE, w2Box12: 'AA', priority: 12, annualLimit: 24500 },
  garnish_child_support: { label: 'Child support order', group: 'garnishment', lowers: NONE, priority: 20 },
  tax_levy: { label: 'IRS or state tax levy', group: 'garnishment', lowers: NONE, priority: 21 },
  garnish_student_loan: { label: 'Student loan garnishment', group: 'garnishment', lowers: NONE, priority: 22 },
  garnish_creditor: { label: 'Creditor or court garnishment', group: 'garnishment', lowers: NONE, priority: 23 },
  advance: { label: 'Advance repayment', group: 'after_tax', lowers: NONE, priority: 40 },
  loan: { label: 'Loan repayment', group: 'after_tax', lowers: NONE, priority: 41 },
  escrow: { label: 'Escrow contribution', group: 'after_tax', lowers: NONE, priority: 42 },
  other_after_tax: { label: 'Other deduction (after tax)', group: 'after_tax', lowers: NONE, priority: 43 },
};

export const isPreTax = (k: DeductionKind) => Object.values(KINDS[k].lowers).some(Boolean);
export const isGarnishment = (k: DeductionKind) => KINDS[k].group === 'garnishment';

/** Extra room above the yearly limit for older savers. Chosen on the plan, since the hub does not hold birth dates. */
export type CatchUp = 'none' | 'age_50' | 'age_60_63' | 'age_55_hsa';
const CATCH_UP: Record<DeductionKind, Partial<Record<CatchUp, number>>> = {
  retirement_pretax: { age_50: 8000, age_60_63: 11250 },
  retirement_roth: { age_50: 8000, age_60_63: 11250 },
  hsa: { age_55_hsa: 1000 },
} as Record<DeductionKind, Partial<Record<CatchUp, number>>>;

/** The most an employee may put in for the year. HSA is higher for family coverage. */
export function annualLimitFor(plan: Pick<DeductionPlan, 'kind' | 'catchUp' | 'familyCoverage' | 'annualLimitOverride'>): number | null {
  if (plan.annualLimitOverride != null) return plan.annualLimitOverride;
  const base = KINDS[plan.kind].annualLimit;
  if (base == null) return null;
  const family = plan.kind === 'hsa' && plan.familyCoverage ? 8750 : base;
  return family + (CATCH_UP[plan.kind]?.[plan.catchUp ?? 'none'] ?? 0);
}

export interface DeductionPlan {
  id: string;
  kind: DeductionKind;
  label: string;
  /** 'flat' is dollars each pay period. 'percent' is a percent of the pay that deduction is figured on. */
  method: 'flat' | 'percent';
  amount: number;
  /** What the company adds (a 401(k) match or its share of premiums) each period. For the W-2 and the cost report only. */
  employerAmount?: number;
  startDate: string;
  endDate?: string | null;
  /** Stop when this total has been collected (a loan or garnishment balance). */
  totalToCollect?: number | null;
  /** Collected so far, before this pay. */
  collected: number;
  /** Contributed so far this calendar year, before this pay (for yearly limits). */
  ytdThisYear: number;
  priority?: number;
  catchUp?: CatchUp;
  familyCoverage?: boolean;
  annualLimitOverride?: number | null;
  /** Child support: the person supports another spouse or child, and the support is more than 12 weeks behind. */
  supportingFamily?: boolean;
  arrearsOver12Weeks?: boolean;
  /** An IRS levy: the amount per pay period that is exempt from the levy (from Form 668-W, Pub. 1494). */
  levyExemptPerPeriod?: number;
  note?: string;
}

export interface AppliedDeduction {
  planId: string;
  kind: DeductionKind;
  label: string;
  amount: number;
  preTax: boolean;
  employerAmount: number;
  /** What was asked for, when less was taken, and why. */
  note?: string;
}

export interface DeductionResult {
  /** How much each tax base is lowered by this period's before-tax deductions. */
  preTax: { fit: number; fica: number; futa: number; state: number };
  applied: AppliedDeduction[];
  employerContributions: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** 30 times the federal minimum wage ($7.25) for a pay period, the floor under ordinary garnishments (15 U.S.C. 1673). */
export const CCPA_FLOOR: Record<PayFrequency, number> = { weekly: 217.5, biweekly: 435, semimonthly: 471.25, monthly: 942.5 };

const inForce = (p: DeductionPlan, payDate: string) => p.startDate <= payDate && (!p.endDate || p.endDate >= payDate);

function wanted(p: DeductionPlan, base: number): number {
  return round2(p.method === 'percent' ? (base * p.amount) / 100 : p.amount);
}

/**
 * Step 1: the deductions taken before tax. They are limited to what is left of the yearly limit, to the balance still
 * owed, and to the pay itself, so a deduction can never push taxable pay below zero.
 */
export function preTaxDeductions(args: { gross: number; payDate: string; plans: DeductionPlan[] }): DeductionResult {
  const { gross, payDate } = args;
  const out: DeductionResult = { preTax: { fit: 0, fica: 0, futa: 0, state: 0 }, applied: [], employerContributions: 0, warnings: [] };
  let room = Math.max(0, gross);
  const plans = args.plans.filter((p) => isPreTax(p.kind) && inForce(p, payDate)).sort((a, b) => (a.priority ?? KINDS[a.kind].priority) - (b.priority ?? KINDS[b.kind].priority));
  for (const p of plans) {
    let take = wanted(p, gross);
    let note: string | undefined;
    const limit = annualLimitFor(p);
    if (limit != null) {
      const left = Math.max(0, round2(limit - p.ytdThisYear));
      if (take > left) { take = left; note = `Yearly limit of ${limit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} reached.`; }
    }
    if (p.totalToCollect != null) {
      const left = Math.max(0, round2(p.totalToCollect - p.collected));
      if (take > left) { take = left; note = 'Balance reached.'; }
    }
    if (take > room) { take = round2(room); note = 'Pay was too small for the full amount.'; }
    take = round2(Math.max(0, take));
    room = round2(room - take);
    if (note) out.warnings.push(`${p.label}: ${note}`);
    const lowers = KINDS[p.kind].lowers;
    if (lowers.fit) out.preTax.fit = round2(out.preTax.fit + take);
    if (lowers.fica) out.preTax.fica = round2(out.preTax.fica + take);
    if (lowers.futa) out.preTax.futa = round2(out.preTax.futa + take);
    if (lowers.state) out.preTax.state = round2(out.preTax.state + take);
    const employer = take > 0 ? round2(p.employerAmount ?? 0) : 0;
    out.employerContributions = round2(out.employerContributions + employer);
    out.applied.push({ planId: p.id, kind: p.kind, label: p.label, amount: take, preTax: true, employerAmount: employer, note });
  }
  return out;
}

/** The pay left after the taxes the law requires. Voluntary deductions (insurance, 401(k)) do not reduce it. */
export function disposableEarnings(gross: number, requiredDeductions: number): number {
  return round2(Math.max(0, gross - requiredDeductions));
}

/** The most that may be taken for each kind of garnishment from one paycheck, before the combined limit. */
export function garnishmentCaps(disposable: number, frequency: PayFrequency, plan: Pick<DeductionPlan, 'kind' | 'supportingFamily' | 'arrearsOver12Weeks' | 'levyExemptPerPeriod'>): number {
  switch (plan.kind) {
    case 'garnish_child_support': {
      const pct = (plan.supportingFamily ? 0.5 : 0.6) + (plan.arrearsOver12Weeks ? 0.05 : 0);
      return round2(disposable * pct);
    }
    case 'garnish_student_loan':
      return round2(disposable * 0.15);
    case 'garnish_creditor':
      return round2(Math.min(disposable * 0.25, Math.max(0, disposable - CCPA_FLOOR[frequency])));
    case 'tax_levy':
      return round2(Math.max(0, disposable - (plan.levyExemptPerPeriod ?? 0)));
    default:
      return 0;
  }
}

/**
 * Step 2: everything taken after tax, in order: garnishments first (they are the law), then loans, advances, escrow and
 * the rest. Garnishments respect the federal caps and the combined limit; nothing takes net pay below zero.
 *
 * Combined limit (15 U.S.C. 1673): when a child support order applies, all the non-levy garnishments together may not
 * exceed the child support limit; otherwise they may not exceed the ordinary 25% limit. Levies are outside that limit.
 * State law can be lower than these federal limits. The pay stub says when an amount was cut, and the order or the state's
 * rules always win over this estimate.
 */
export function afterTaxDeductions(args: {
  /** Pay before any deduction, for percent deductions. */
  gross: number;
  /** Pay that is left after tax and before-tax deductions. This is what is available to take from. */
  available: number;
  /** The pay left after required deductions only (taxes), for the garnishment limits. */
  disposable: number;
  payDate: string;
  frequency: PayFrequency;
  plans: DeductionPlan[];
}): DeductionResult {
  const { gross, payDate, frequency } = args;
  const out: DeductionResult = { preTax: { fit: 0, fica: 0, futa: 0, state: 0 }, applied: [], employerContributions: 0, warnings: [] };
  let available = Math.max(0, args.available);
  const plans = args.plans.filter((p) => !isPreTax(p.kind) && inForce(p, payDate)).sort((a, b) => (a.priority ?? KINDS[a.kind].priority) - (b.priority ?? KINDS[b.kind].priority));

  const hasSupport = plans.some((p) => p.kind === 'garnish_child_support');
  const supportCap = hasSupport
    ? Math.max(...plans.filter((p) => p.kind === 'garnish_child_support').map((p) => garnishmentCaps(args.disposable, frequency, p)))
    : 0;
  const combinedCap = hasSupport ? supportCap : round2(Math.min(args.disposable * 0.25, Math.max(0, args.disposable - CCPA_FLOOR[frequency])));
  let combinedUsed = 0;

  for (const p of plans) {
    let take = wanted(p, gross);
    let note: string | undefined;
    if (p.totalToCollect != null) {
      const left = Math.max(0, round2(p.totalToCollect - p.collected));
      if (take > left) { take = left; note = 'Balance reached.'; }
    }
    if (isGarnishment(p.kind)) {
      const own = garnishmentCaps(args.disposable, frequency, p);
      if (take > own) { take = own; note = 'Limited by the federal garnishment cap.'; }
      if (p.kind !== 'tax_levy') {
        const left = Math.max(0, round2(combinedCap - combinedUsed));
        if (take > left) { take = left; note = 'Limited by the combined garnishment cap.'; }
      }
    }
    if (take > available) { take = round2(available); note = 'Not enough pay left to take the full amount.'; }
    take = round2(Math.max(0, take));
    available = round2(available - take);
    if (isGarnishment(p.kind) && p.kind !== 'tax_levy') combinedUsed = round2(combinedUsed + take);
    if (note) out.warnings.push(`${p.label}: ${note} (${take.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} taken)`);
    out.applied.push({ planId: p.id, kind: p.kind, label: p.label, amount: take, preTax: false, employerAmount: 0, note });
  }
  return out;
}
