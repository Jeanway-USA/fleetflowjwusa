/**
 * W-2 payroll calculator — SINGLE SOURCE OF TRUTH.
 *
 * Every rendered W-2 tax number and every server-side run in
 * `run-w2-payroll` MUST go through this module. Do not inline these
 * formulas anywhere else.
 *
 * Algorithm (IRS Pub 15-T, Percentage Method, Worksheet 1A):
 *   1. Annualize the period gross pay by the pay frequency.
 *   2. Subtract the standard deduction for the filing status.
 *   3. Walk the annual bracket table → annual FIT.
 *   4. Divide annual FIT by the number of periods per year → period FIT.
 *   5. Add the driver's per-period extra withholding.
 *
 * FICA:
 *   - Social Security: 6.2 % of gross, capped at wage base minus YTD SS wages.
 *   - Medicare: 1.45 % of gross (uncapped). Employee only: +0.9 %
 *     Additional Medicare on YTD Medicare wages above $200 000.
 *   - Employer FICA match: mirror employee SS + Medicare (NO additional Medicare).
 *
 * FL SUTA (employer only):
 *   min(gross, remaining wage-base headroom) × suta_rate.
 */

export type FilingStatus = 'single' | 'married_joint' | 'head_of_household';
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface FitBracket {
  over: number;
  base: number;
  rate: number;
}

export interface PayrollSettings {
  fit_brackets: Record<FilingStatus, FitBracket[]>;
  standard_deduction: Record<FilingStatus, number>;
  social_security_rate: number;
  social_security_wage_base: number;
  medicare_rate: number;
  additional_medicare_rate: number;
  additional_medicare_threshold: number;
  /** @deprecated Use per-state stateConfig instead. Retained for backfill. */
  suta_rate: number;
  /** @deprecated Use per-state stateConfig instead. Retained for backfill. */
  suta_wage_base: number;
  pay_frequency: PayFrequency;
  default_tax_state?: string;
}

export interface StateTaxConfig {
  state_code: string;
  suta_rate: number;
  suta_wage_base: number;
  has_state_income_tax: boolean;
  sit_rate: number;
}

export interface W4Info {
  filing_status: FilingStatus;
  extra_withholding: number;
  dependents_amount: number;
}

export interface YtdSnapshot {
  /** YTD gross wages already subject to Social Security (excludes current run). */
  ss_wages: number;
  /** YTD Medicare wages already reported (excludes current run). */
  medicare_wages: number;
  /** YTD wages already applied to SUTA taxable base (excludes current run). */
  suta_wages: number;
}

export interface W2PayrollInput {
  grossPay: number;
  settings: PayrollSettings;
  w4: W4Info;
  ytd: YtdSnapshot;
  /** Resolved state tax config for this driver. Falls back to FL 2.7%/$7k if omitted. */
  stateConfig?: StateTaxConfig;
}

export interface W2PayrollBreakdown {
  grossPay: number;
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;
  stateIncomeTax: number;
  employeeTotal: number;
  netPay: number;
  employerSsTax: number;
  employerMedicareTax: number;
  employerFicaTotal: number;
  /** Employer SUTA tax for the driver's state (kept name `flSutaTax` for backwards compat). */
  flSutaTax: number;
  flSutaWageBaseApplied: number;
  stateCode: string;
}

export const DEFAULT_STATE_CONFIG: StateTaxConfig = {
  state_code: 'FL',
  suta_rate: 0.027,
  suta_wage_base: 7000,
  has_state_income_tax: false,
  sit_rate: 0,
};

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeAnnualFit(
  annualTaxable: number,
  brackets: FitBracket[],
): number {
  if (annualTaxable <= 0) return 0;
  // Find the bracket where `over` is the largest value <= annualTaxable.
  let match = brackets[0];
  for (const b of brackets) {
    if (annualTaxable > b.over) match = b;
    else break;
  }
  return match.base + (annualTaxable - match.over) * match.rate;
}

export function calculateW2Payroll(input: W2PayrollInput): W2PayrollBreakdown {
  const { settings, w4, ytd } = input;
  const stateConfig = input.stateConfig ?? DEFAULT_STATE_CONFIG;
  const gross = Math.max(0, Number(input.grossPay) || 0);
  const periods = PERIODS_PER_YEAR[settings.pay_frequency] ?? 52;

  // ---- Federal Income Tax (Pub 15-T Percentage Method, 2020+ W-4)
  const annualGross = gross * periods;
  const stdDed = settings.standard_deduction[w4.filing_status] ?? 0;
  const annualTaxable = Math.max(0, annualGross - stdDed);
  const brackets = settings.fit_brackets[w4.filing_status] ?? [];
  const annualFit = computeAnnualFit(annualTaxable, brackets);
  const annualFitAfterCredits = Math.max(0, annualFit - (w4.dependents_amount || 0));
  const periodFit = annualFitAfterCredits / periods + (w4.extra_withholding || 0);
  const federalIncomeTax = round2(Math.max(0, periodFit));

  // ---- Social Security (employee + employer)
  const ssHeadroom = Math.max(0, settings.social_security_wage_base - ytd.ss_wages);
  const ssTaxable = Math.min(gross, ssHeadroom);
  const socialSecurityTax = round2(ssTaxable * settings.social_security_rate);
  const employerSsTax = socialSecurityTax;

  // ---- Medicare (employee + employer, uncapped)
  const medicareTax = round2(gross * settings.medicare_rate);
  const employerMedicareTax = medicareTax;

  // ---- Additional Medicare (employee only) on YTD wages above threshold
  const newMedicareYtd = ytd.medicare_wages + gross;
  const addlOver = Math.max(0, newMedicareYtd - settings.additional_medicare_threshold);
  const addlAlreadyTaxed = Math.max(0, ytd.medicare_wages - settings.additional_medicare_threshold);
  const addlPeriodBase = Math.max(0, addlOver - addlAlreadyTaxed);
  const additionalMedicareTax = round2(addlPeriodBase * settings.additional_medicare_rate);

  // ---- State Income Tax (flat rate; only when the state levies SIT)
  const stateIncomeTax = stateConfig.has_state_income_tax
    ? round2(gross * (Number(stateConfig.sit_rate) || 0))
    : 0;

  // ---- State SUTA (employer only) — driven by per-state config
  const sutaHeadroom = Math.max(0, stateConfig.suta_wage_base - ytd.suta_wages);
  const flSutaWageBaseApplied = Math.min(gross, sutaHeadroom);
  const flSutaTax = round2(flSutaWageBaseApplied * stateConfig.suta_rate);

  const employeeTotal = round2(
    federalIncomeTax + socialSecurityTax + medicareTax + additionalMedicareTax + stateIncomeTax,
  );
  const netPay = round2(gross - employeeTotal);
  const employerFicaTotal = round2(employerSsTax + employerMedicareTax);

  return {
    grossPay: round2(gross),
    federalIncomeTax,
    socialSecurityTax,
    medicareTax,
    additionalMedicareTax,
    stateIncomeTax,
    employeeTotal,
    netPay,
    employerSsTax,
    employerMedicareTax,
    employerFicaTotal,
    flSutaTax,
    flSutaWageBaseApplied: round2(flSutaWageBaseApplied),
    stateCode: stateConfig.state_code,
  };
}

export const EMPTY_YTD: YtdSnapshot = { ss_wages: 0, medicare_wages: 0, suta_wages: 0 };

export const DEFAULT_W4: W4Info = {
  filing_status: 'single',
  extra_withholding: 0,
  dependents_amount: 0,
};

export const DEFAULT_W2_GROSS = 1700;

// ---------------------------------------------------------------------------
// Gusto Embedded Payroll — data mapping
// ---------------------------------------------------------------------------
// These helpers translate our internal Landstar settlement objects into the
// payload shapes that Gusto's Embedded Payroll API expects. They are pure —
// no fetch calls — so they can be reused by both the edge function proxy and
// the RunW2PayrollDialog preview panel.

export interface GustoAddressInput {
  street_1: string;
  street_2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface GustoEmployeeInput {
  first_name: string;
  last_name: string;
  middle_initial?: string;
  email?: string;
  date_of_birth?: string; // YYYY-MM-DD
  ssn?: string;           // 9 digits, no dashes
  home_address?: GustoAddressInput;
}

export type GustoFixedCompensationName =
  | 'Regular Hours'
  | 'Overtime Hours'
  | 'Double overtime'
  | 'Bonus'
  | 'Commission'
  | 'Reimbursement'
  | 'Paycheck Tips'
  | 'Cash Tips'
  | 'Correction Payment'
  | 'Severance'
  | 'Minimum Wage Adjustment';

export interface GustoFixedCompensation {
  name: GustoFixedCompensationName;
  amount: string; // Gusto expects strings for money
  job_uuid?: string;
}

export interface GustoHourlyCompensation {
  name: 'Regular Hours' | 'Overtime Hours' | 'Double overtime';
  hours: string;
  job_uuid?: string;
}

export interface GustoPaycheckDeduction {
  name: string;
  amount: string;
}

export interface GustoEmployeeCompensation {
  employee_uuid: string;
  gross_pay?: string;
  fixed_compensations?: GustoFixedCompensation[];
  hourly_compensations?: GustoHourlyCompensation[];
  paycheck_tips?: string;
  memo?: string;
}

export interface GustoPayrollInputRecord {
  payroll_uuid: string;
  inputs: GustoEmployeeCompensation[];
}

/** Minimal driver shape needed to map to a Gusto employee. */
export interface DriverForGusto {
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}

export interface W4ForGusto {
  filing_status?: string | null;
  ssn?: string | null;
  date_of_birth?: string | null;
  home_address?: GustoAddressInput | null;
}

export function mapDriverToGustoEmployee(
  driver: DriverForGusto,
  w4?: W4ForGusto | null,
): GustoEmployeeInput {
  const ssn = (w4?.ssn ?? '').replace(/\D/g, '');
  return {
    first_name: (driver.first_name ?? '').trim() || 'Driver',
    last_name: (driver.last_name ?? '').trim() || 'Unknown',
    email: driver.email ?? undefined,
    date_of_birth: w4?.date_of_birth ?? undefined,
    ssn: ssn.length === 9 ? ssn : undefined,
    home_address: w4?.home_address ?? undefined,
  };
}

/** Line-item shape produced by our Landstar settlement parser. */
export interface SettlementLineForGusto {
  item_type:
    | 'load_pay'
    | 'bonus'
    | 'reimbursement'
    | 'deduction'
    | 'commission'
    | string;
  amount: number;
  description?: string | null;
}

export interface SettlementForGusto {
  gross_pay: number;
  reimbursements?: number | null;
  deductions?: number | null;
  memo?: string | null;
  items?: SettlementLineForGusto[];
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function mapSettlementToGustoPayrollInputs(
  settlement: SettlementForGusto,
  employeeUuid: string,
): GustoEmployeeCompensation {
  const fixed: GustoFixedCompensation[] = [];
  const items = settlement.items ?? [];

  const loadPayTotal = items
    .filter((i) => i.item_type === 'load_pay')
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const base = loadPayTotal > 0 ? loadPayTotal : Number(settlement.gross_pay || 0);
  if (base > 0) {
    fixed.push({ name: 'Regular Hours', amount: money(base) });
  }

  for (const item of items) {
    const amount = Number(item.amount || 0);
    if (!amount) continue;
    switch (item.item_type) {
      case 'bonus':
        fixed.push({ name: 'Bonus', amount: money(amount) });
        break;
      case 'commission':
        fixed.push({ name: 'Commission', amount: money(amount) });
        break;
      case 'reimbursement':
        fixed.push({ name: 'Reimbursement', amount: money(amount) });
        break;
      case 'deduction':
        // Gusto handles deductions on the employee record, not here; skip.
        break;
      default:
        break;
    }
  }

  // Fallback reimbursements column when no line items were supplied
  if (!items.some((i) => i.item_type === 'reimbursement') &&
      Number(settlement.reimbursements || 0) > 0) {
    fixed.push({
      name: 'Reimbursement',
      amount: money(Number(settlement.reimbursements)),
    });
  }

  return {
    employee_uuid: employeeUuid,
    fixed_compensations: fixed,
    memo: settlement.memo ?? undefined,
  };
}

export function summarizeGustoPayrollBatch(
  inputs: GustoEmployeeCompensation[],
): { totalGross: number; totalReimbursements: number; totalBonus: number } {
  let totalGross = 0;
  let totalReimbursements = 0;
  let totalBonus = 0;
  for (const emp of inputs) {
    for (const fc of emp.fixed_compensations ?? []) {
      const amt = Number(fc.amount) || 0;
      if (fc.name === 'Reimbursement') totalReimbursements += amt;
      else if (fc.name === 'Bonus') totalBonus += amt;
      else totalGross += amt;
    }
  }
  return {
    totalGross: round2(totalGross),
    totalReimbursements: round2(totalReimbursements),
    totalBonus: round2(totalBonus),
  };
}


