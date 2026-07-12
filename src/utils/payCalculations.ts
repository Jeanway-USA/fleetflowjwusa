/**
 * SINGLE SOURCE OF TRUTH for driver pay calculations.
 *
 * Every driver-pay number rendered in the app MUST flow through this module.
 * Do NOT inline pay math anywhere else. If a new pay type is needed,
 * extend this file and update its test.
 *
 * Pay-type math (gross):
 *   percentage : ((rate * landstarSplit) * driverPct/100) + accessorials
 *                - FSC is EXCLUDED from the percentage base.
 *                - In Independent Owner-Operator mode the landstarSplit is 1.0.
 *   per_mile/cpm : (booked_miles * pay_rate) + accessorials
 *   flat        : (weekly_flat_rate) + accessorials across delivered loads in period.
 *                 Per-load pay returns only that load's accessorials.
 *   hourly      : (hoursWorked * hourly_rate). No per-load component.
 *
 * Employment-type routing (net):
 *   w2_company        : Net = Gross - (Gross * w2WithholdingRate). Any pay type
 *                       is legal (per_mile, percentage, flat, hourly). Gross is
 *                       computed the same way as contractor; only tax withholding
 *                       differentiates the tracks. Statutory deductions are
 *                       modeled as a single effective withholding rate (default
 *                       22%, configurable via settings.w2WithholdingRate).
 *   1099_contractor /
 *   lease_purchase    : Net = Gross + Reimbursements - Deductions. No tax
 *                       withholding (contractor handles their own taxes).
 *                       Reimbursements/Deductions live on the settlement, not
 *                       on a single load — they are applied in calculateWeeklyPay.
 *                       For lease_purchase drivers, deductions flagged as
 *                       escrow are mirrored to lease_purchase_agreements.current_escrow_balance
 *                       inside the DB recalc_settlement_totals function.
 */

export type CanonicalPayType = 'percentage' | 'per_mile' | 'flat' | 'hourly';

export type DriverPayType = CanonicalPayType | 'cpm' | string | null | undefined;

export type TmsMode = 'landstar' | 'independent';

export type EmploymentType =
  | 'w2_company'
  | '1099_contractor'
  | 'lease_purchase';

/** Math bucket: W-2 has tax withheld; everyone else is contractor-style. */
export type EmploymentClass = 'w2' | 'contractor';

export const DEFAULT_W2_WITHHOLDING = 0.22;

export interface PayDriver {
  pay_type: DriverPayType;
  pay_rate: number | null | undefined;
  /** Optional override; falls back to pay_rate for flat drivers. */
  weekly_flat_rate?: number | null;
  /** Optional override; falls back to pay_rate for hourly drivers. */
  hourly_rate?: number | null;
  /** Drives W-2 vs contractor net-pay routing. Defaults to contractor when missing. */
  employment_type?: EmploymentType | null;
}

export interface PayLoad {
  rate?: number | null;
  fuel_surcharge?: number | null;
  booked_miles?: number | null;
  load_accessorials?: Array<{ amount?: number | null; is_driver_pay?: boolean | null }> | null;
}

export interface PaySettings {
  /**
   * Landstar pre-split applied to the linehaul rate before the driver's
   * percentage. Default 0.65. Only applied when tmsMode === 'landstar'.
   * Read from org `company_settings.truck_percentage` (divided by 100).
   */
  landstarSplit?: number;
  tmsMode?: TmsMode;
  /**
   * Effective withholding rate (0..1) applied to W-2 driver gross pay.
   * Falls back to DEFAULT_W2_WITHHOLDING.
   */
  w2WithholdingRate?: number;
}

export interface PayBreakdown {
  base: number;
  accessorialsTotal: number;
  /** Gross pay (same as `grossPay`; kept for backwards compatibility). */
  total: number;
  grossPay: number;
  taxWithholding: number;
  netPay: number;
  payType: CanonicalPayType | 'unknown';
  employmentClass: EmploymentClass;
  formulaLabel: string;
}

const DEFAULT_LANDSTAR_SPLIT = 0.65;

const n = (v: unknown): number => {
  const num = Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
};

export function normalizePayType(pt: DriverPayType): CanonicalPayType | 'unknown' {
  const t = (pt || '').toString().toLowerCase();
  if (t === 'percentage') return 'percentage';
  if (t === 'per_mile' || t === 'cpm') return 'per_mile';
  if (t === 'flat') return 'flat';
  if (t === 'hourly') return 'hourly';
  return 'unknown';
}

/**
 * W-2 drivers run on the statutory-withholding track. Contractors and
 * lease-purchase operators run on the gross-minus-deductions track.
 * Missing/unknown employment_type defaults to contractor for backwards compat.
 */
export function classifyEmployment(
  driver?: { employment_type?: EmploymentType | null } | null,
): EmploymentClass {
  return driver?.employment_type === 'w2_company' ? 'w2' : 'contractor';
}

function effectiveW2Withholding(settings?: PaySettings): number {
  const r = settings?.w2WithholdingRate;
  if (r == null || !Number.isFinite(r) || r < 0) return DEFAULT_W2_WITHHOLDING;
  return r > 1 ? r / 100 : r;
}

export function sumAccessorials(load: PayLoad | null | undefined): number {
  if (!load?.load_accessorials) return 0;
  // Only driver-payable accessorials count toward driver pay.
  // `!== false` keeps legacy/undefined rows (default true) included.
  return load.load_accessorials
    .filter((a) => a?.is_driver_pay !== false)
    .reduce((s, a) => s + n(a?.amount), 0);
}

function effectiveLandstarSplit(settings?: PaySettings): number {
  const mode = settings?.tmsMode ?? 'landstar';
  if (mode === 'independent') return 1;
  const split = settings?.landstarSplit;
  if (split == null || !Number.isFinite(split) || split <= 0) return DEFAULT_LANDSTAR_SPLIT;
  return split;
}

function buildBreakdown(args: {
  base: number;
  accessorialsTotal: number;
  payType: CanonicalPayType | 'unknown';
  driver?: PayDriver | null;
  settings?: PaySettings;
  formulaLabel: string;
}): PayBreakdown {
  const employmentClass = classifyEmployment(args.driver);
  const grossPay = args.base + args.accessorialsTotal;
  const taxWithholding =
    employmentClass === 'w2'
      ? Math.round(grossPay * effectiveW2Withholding(args.settings) * 100) / 100
      : 0;
  // Reimbursements / deductions are settlement-level concepts and do not
  // belong to a single load — they fold in via calculateWeeklyPay.
  const netPay = grossPay - taxWithholding;
  return {
    base: args.base,
    accessorialsTotal: args.accessorialsTotal,
    total: grossPay,
    grossPay,
    taxWithholding,
    netPay,
    payType: args.payType,
    employmentClass,
    formulaLabel: args.formulaLabel,
  };
}

/**
 * Pay for ONE load. For flat/hourly drivers per-load pay is only accessorials
 * (base earned weekly, not per-load).
 */
export function calculateLoadPay(
  load: PayLoad | null | undefined,
  driver: PayDriver | null | undefined,
  settings?: PaySettings,
): PayBreakdown {
  const accessorialsTotal = sumAccessorials(load);
  const type = normalizePayType(driver?.pay_type);
  const rate = n(driver?.pay_rate);

  if (!load || !driver) {
    return buildBreakdown({
      base: 0,
      accessorialsTotal,
      payType: type,
      driver,
      settings,
      formulaLabel: '—',
    });
  }

  if (type === 'percentage') {
    const split = effectiveLandstarSplit(settings);
    const base = n(load.rate) * split * (rate / 100);
    return buildBreakdown({
      base,
      accessorialsTotal,
      payType: 'percentage',
      driver,
      settings,
      formulaLabel:
        settings?.tmsMode === 'independent'
          ? `${rate}% of rate + accessorials`
          : `${rate}% of (rate × ${(split * 100).toFixed(0)}% split) + accessorials`,
    });
  }

  if (type === 'per_mile') {
    const base = n(load.booked_miles) * rate;
    return buildBreakdown({
      base,
      accessorialsTotal,
      payType: 'per_mile',
      driver,
      settings,
      formulaLabel: `${n(load.booked_miles).toLocaleString()} mi × $${rate.toFixed(2)} + accessorials`,
    });
  }

  if (type === 'flat' || type === 'hourly') {
    // Flat/hourly are paid by period, not per load. Per-load slice = accessorials only.
    return buildBreakdown({
      base: 0,
      accessorialsTotal,
      payType: type,
      driver,
      settings,
      formulaLabel: type === 'flat' ? 'Flat weekly + accessorials' : 'Hourly + accessorials',
    });
  }

  return buildBreakdown({
    base: 0,
    accessorialsTotal,
    payType: 'unknown',
    driver,
    settings,
    formulaLabel: '—',
  });
}

export interface WeeklyPayInput {
  loads: Array<PayLoad>;
  driver: PayDriver | null | undefined;
  settings?: PaySettings;
  /** Required for hourly drivers. */
  hoursWorked?: number | null;
  /**
   * Settlement-level reimbursements and deductions (contractor / lease only).
   * For W-2, statutory tax withholding is applied automatically; these fields
   * are ignored on the W-2 track because W-2 pay does not carry contractor-style
   * deductions through this engine.
   */
  reimbursements?: number | null;
  deductions?: number | null;
}

export interface WeeklyPayResult {
  base: number;
  accessorialsTotal: number;
  /** Gross (kept for backwards compatibility). */
  total: number;
  grossPay: number;
  taxWithholding: number;
  reimbursements: number;
  deductions: number;
  netPay: number;
  loadCount: number;
  totalMiles: number;
  payType: CanonicalPayType | 'unknown';
  employmentClass: EmploymentClass;
}

/**
 * Pay for a set of loads (typically a pay period).
 * For flat drivers, base = weekly_flat_rate (or pay_rate fallback).
 * For hourly drivers, base = hoursWorked * hourly_rate (or pay_rate).
 * For percentage / per_mile, base is the sum of per-load base pay.
 * Accessorials are always summed across the loads.
 * W-2 gross = base + accessorials, minus statutory withholding.
 * Contractor gross = base + accessorials, plus reimbursements, minus deductions.
 */
export function calculateWeeklyPay({
  loads,
  driver,
  settings,
  hoursWorked,
  reimbursements,
  deductions,
}: WeeklyPayInput): WeeklyPayResult {
  const type = normalizePayType(driver?.pay_type);
  const employmentClass = classifyEmployment(driver);
  const loadArr = loads ?? [];
  const accessorialsTotal = loadArr.reduce((s, l) => s + sumAccessorials(l), 0);
  const totalMiles = loadArr.reduce((s, l) => s + n(l.booked_miles), 0);
  const loadCount = loadArr.length;

  if (!driver) {
    return {
      base: 0,
      accessorialsTotal,
      total: accessorialsTotal,
      grossPay: accessorialsTotal,
      taxWithholding: 0,
      reimbursements: 0,
      deductions: 0,
      netPay: accessorialsTotal,
      loadCount,
      totalMiles,
      payType: type,
      employmentClass,
    };
  }

  // Compute base uniformly across employment classes.
  let base = 0;
  if (type === 'flat') {
    base = n(driver.weekly_flat_rate ?? driver.pay_rate);
  } else if (type === 'hourly') {
    base = n(hoursWorked) * n(driver.hourly_rate ?? driver.pay_rate);
  } else if (type === 'per_mile' || type === 'percentage') {
    for (const load of loadArr) {
      const { base: b } = calculateLoadPay(load, driver, settings);
      base += b;
    }
  }
  // unknown → base stays 0

  // W-2 track: statutory withholding on gross taxable wages.
  if (employmentClass === 'w2') {
    const grossPay = base + accessorialsTotal;
    const taxWithholding =
      Math.round(grossPay * effectiveW2Withholding(settings) * 100) / 100;
    return {
      base,
      accessorialsTotal,
      total: grossPay,
      grossPay,
      taxWithholding,
      reimbursements: 0,
      deductions: 0,
      netPay: grossPay - taxWithholding,
      loadCount,
      totalMiles,
      payType: type,
      employmentClass: 'w2',
    };
  }


  // Contractor / lease track: gross + reimbursements - deductions.
  const grossPay = base + accessorialsTotal;
  const reimb = Math.max(0, n(reimbursements));
  const ded = Math.max(0, n(deductions));
  const netPay = grossPay + reimb - ded;

  return {
    base,
    accessorialsTotal,
    total: grossPay,
    grossPay,
    taxWithholding: 0,
    reimbursements: reimb,
    deductions: ded,
    netPay,
    loadCount,
    totalMiles,
    payType: type,
    employmentClass: 'contractor',
  };
}

// ============================================================================
// In-House Payroll Tax Engine (internal_payroll_ledger + tax_withholding_ledger)
// ============================================================================

export interface PayrollTaxConfig {
  ssWageBase: number;   // e.g. 184500
  ssRate: number;       // e.g. 0.062
  medicareRate: number; // e.g. 0.0145
  txSuiRate: number;    // e.g. 0.027
}

export const DEFAULT_PAYROLL_TAX_CONFIG: PayrollTaxConfig = {
  ssWageBase: 184500,
  ssRate: 0.062,
  medicareRate: 0.0145,
  txSuiRate: 0.027,
};

/**
 * @deprecated Legacy load-revenue-based path. New payroll ledger uses
 * `calculateGrossTaxablePay` off base salary + bonus + holiday.
 * Kept for backwards compatibility with any historical rows.
 */
export function calculateLineHaulBase(params: {
  grossTotal: number;
  fscAmount: number;
  payModel: string;
}): number {
  const gross = Number(params.grossTotal) || 0;
  const fsc = Number(params.fscAmount) || 0;
  if (params.payModel === 'percentage') {
    return Math.max(0, gross - fsc);
  }
  return gross;
}

/**
 * Salary-track taxable wages for W-2 drivers:
 *   Gross Taxable Pay = Base Salary + Bonus + Holiday.
 * This is the sole input to FICA in the in-house payroll ledger.
 */
export function calculateGrossTaxablePay(params: {
  baseSalary: number;
  bonusPay: number;
  holidayPay: number;
}): number {
  const b = Math.max(0, Number(params.baseSalary) || 0);
  const bo = Math.max(0, Number(params.bonusPay) || 0);
  const h = Math.max(0, Number(params.holidayPay) || 0);
  return b + bo + h;
}

export interface PayrollTaxInput {
  grossTaxablePay: number;
  ytdEarnings: number;
  employmentType: 'w2' | '1099';
  config: PayrollTaxConfig;
  federalOverride?: number | null;
  state?: string | null;
}

export interface PayrollTaxResult {
  eeSocialSecurity: number;
  erSocialSecurity: number;
  eeMedicare: number;
  employerMedicare: number;
  federalIncomeWithholding: number;
  txTwcUnemployment: number;
  flReemployment: number;
  totalEmployeeWithholding: number;
  totalEmployerLiability: number;
  netPay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculatePayrollTaxes(input: PayrollTaxInput): PayrollTaxResult {
  const gross = Math.max(0, Number(input.grossTaxablePay) || 0);
  const ytd = Math.max(0, Number(input.ytdEarnings) || 0);
  const cfg = input.config;

  // 1099 contractors: zero out all withholdings.
  if (input.employmentType !== 'w2') {
    return {
      eeSocialSecurity: 0,
      erSocialSecurity: 0,
      eeMedicare: 0,
      employerMedicare: 0,
      federalIncomeWithholding: 0,
      txTwcUnemployment: 0,
      flReemployment: 0,
      totalEmployeeWithholding: 0,
      totalEmployerLiability: 0,
      netPay: round2(gross),
    };
  }

  // Social Security — capped at (wageBase - YTD)
  const ssRemaining = Math.max(0, cfg.ssWageBase - ytd);
  const ssTaxable = Math.min(gross, ssRemaining);
  const eeSS = round2(ssTaxable * cfg.ssRate);
  const erSS = round2(ssTaxable * cfg.ssRate);

  // Medicare — no cap
  const eeMed = round2(gross * cfg.medicareRate);
  const erMed = round2(gross * cfg.medicareRate);

  // Texas SUI — employer-only, only for W-2 in TX
  const txSui = (input.state ?? '').toUpperCase() === 'TX'
    ? round2(gross * cfg.txSuiRate)
    : 0;

  // Florida reemployment — placeholder 0 (rate not configured yet)
  const flReemp = 0;

  const fit = Math.max(0, Number(input.federalOverride) || 0);

  const totalEmp = round2(eeSS + eeMed + fit);
  const totalEr = round2(erSS + erMed + txSui + flReemp);
  const net = round2(gross - totalEmp);

  return {
    eeSocialSecurity: eeSS,
    erSocialSecurity: erSS,
    eeMedicare: eeMed,
    employerMedicare: erMed,
    federalIncomeWithholding: fit,
    txTwcUnemployment: txSui,
    flReemployment: flReemp,
    totalEmployeeWithholding: totalEmp,
    totalEmployerLiability: totalEr,
    netPay: net,
  };
}

// ============================================================================
// Tax-Ready W-2 Payroll Engine (IRS Pub 15-T Worksheet 1A percentage method)
// ============================================================================

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export const PAY_PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export type FilingStatus = 'single' | 'married_joint' | 'head_of_household';

export interface FitBracket { over: number; base: number; rate: number }

export interface W2FederalConfig {
  social_security_rate: number;
  social_security_wage_base: number;
  medicare_rate: number;
  additional_medicare_rate: number;
  additional_medicare_threshold: number;
  pay_frequency: PayFrequency;
  fit_brackets: Record<FilingStatus, FitBracket[]>;
  standard_deduction: Record<FilingStatus, number>;
}

export interface W2StateConfig {
  state_code: string;
  suta_rate: number;
  suta_wage_base: number;
  has_state_income_tax: boolean;
  sit_rate: number;
}

export interface W2W4 {
  filing_status: FilingStatus;
  multiple_jobs: boolean;
  step_2c_checkbox: boolean;
  dependents_amount: number;
  other_income: number;
  deductions: number;
  extra_withholding: number;
}

export const DEFAULT_W4: W2W4 = {
  filing_status: 'single',
  multiple_jobs: false,
  step_2c_checkbox: false,
  dependents_amount: 0,
  other_income: 0,
  deductions: 0,
  extra_withholding: 0,
};

export interface StateW4Snapshot {
  exempt: boolean;
  filing_status: FilingStatus;
  allowances: number;
  additional_withholding: number;
}

/** Approximate allowance value in dollars; used until per-state allowance tables land. */
const STATE_ALLOWANCE_VALUE = 2000;

export interface W2PayrollInput {
  grossTaxablePay: number;
  ytdGrossTaxablePay: number;
  ytdMedicareWages: number;
  w4: W2W4;
  federal: W2FederalConfig;
  state?: W2StateConfig | null;
  /**
   * Snapshot of the driver's state-tax form. When provided:
   * - exempt=true zeroes SIT
   * - allowances reduce annualized taxable state wages by allowances*STATE_ALLOWANCE_VALUE
   * - additional_withholding is added on top per period
   * filing_status is accepted for audit but not yet branched on (single rate model).
   */
  stateW4?: StateW4Snapshot | null;
}


export interface W2PayrollResult {
  gross: number;
  fit: number;
  eeSocialSecurity: number;
  erSocialSecurity: number;
  eeMedicare: number;
  erMedicare: number;
  addlMedicare: number;
  sutaEmployer: number;
  sitEmployee: number;
  totalEmployeeWithholding: number;
  totalEmployerLiability: number;
  netPay: number;
}

function bracketLookup(brackets: FitBracket[], adjustedAnnual: number): number {
  if (adjustedAnnual <= 0 || !brackets?.length) return 0;
  // Brackets ordered ascending by `over`. Find highest whose `over` <= wages.
  let match = brackets[0];
  for (const b of brackets) {
    if (adjustedAnnual > b.over) match = b;
  }
  return match.base + (adjustedAnnual - match.over) * match.rate;
}

/**
 * IRS Pub 15-T Worksheet 1A percentage method, 2020+ Form W-4.
 * Returns the FIT to withhold for a single pay period.
 */
export function calculateFitPub15T(input: {
  grossTaxablePay: number;
  w4: W2W4;
  federal: W2FederalConfig;
}): number {
  const { grossTaxablePay, w4, federal } = input;
  const periods = PAY_PERIODS_PER_YEAR[federal.pay_frequency] ?? 52;
  const filing = (w4.filing_status ?? 'single') as FilingStatus;
  const useStep2 = !!(w4.multiple_jobs || w4.step_2c_checkbox);

  const annualWages = Math.max(0, grossTaxablePay) * periods
    + Math.max(0, w4.other_income || 0);
  const standardDed = federal.standard_deduction?.[filing] ?? 0;
  // Step 2 checkbox halves the standard deduction (Pub 15-T Worksheet 1A line 1i).
  const effStandard = useStep2 ? standardDed / 2 : standardDed;
  const adjustedAnnual = Math.max(
    0,
    annualWages - (Math.max(0, w4.deductions || 0) + effStandard),
  );

  const brackets = federal.fit_brackets?.[filing] ?? [];
  let annualTax = bracketLookup(brackets, adjustedAnnual);
  // Dependents credit reduces annual tax.
  annualTax = Math.max(0, annualTax - Math.max(0, w4.dependents_amount || 0));
  const periodFit = annualTax / periods + Math.max(0, w4.extra_withholding || 0);
  return round2(Math.max(0, periodFit));
}

export function calculateW2Payroll(input: W2PayrollInput): W2PayrollResult {
  const gross = Math.max(0, Number(input.grossTaxablePay) || 0);
  const ytdGross = Math.max(0, Number(input.ytdGrossTaxablePay) || 0);
  const ytdMed = Math.max(0, Number(input.ytdMedicareWages) || 0);
  const f = input.federal;
  const s = input.state ?? null;

  // Social Security capped at wage base (year-to-date aware).
  const ssRemaining = Math.max(0, f.social_security_wage_base - ytdGross);
  const ssTaxable = Math.min(gross, ssRemaining);
  const eeSS = round2(ssTaxable * f.social_security_rate);
  const erSS = round2(ssTaxable * f.social_security_rate);

  // Medicare (no cap).
  const eeMed = round2(gross * f.medicare_rate);
  const erMed = round2(gross * f.medicare_rate);

  // Additional Medicare (employee-only) on wages over threshold within year.
  const threshold = f.additional_medicare_threshold;
  const prior = ytdMed;
  const total = prior + gross;
  const overNow = Math.max(0, total - threshold);
  const overPrior = Math.max(0, prior - threshold);
  const addlBase = Math.max(0, overNow - overPrior);
  const addlMed = round2(addlBase * f.additional_medicare_rate);

  // FIT via Pub 15-T.
  const fit = calculateFitPub15T({ grossTaxablePay: gross, w4: input.w4, federal: f });

  // State SUTA (employer-only, wage-base capped).
  let sutaEr = 0;
  if (s && s.suta_rate > 0 && s.suta_wage_base > 0) {
    const remaining = Math.max(0, s.suta_wage_base - ytdGross);
    const taxable = Math.min(gross, remaining);
    sutaEr = round2(taxable * s.suta_rate);
  }

  // State income tax (employee).
  const sit = s && s.has_state_income_tax ? round2(gross * s.sit_rate) : 0;

  const totalEE = round2(eeSS + eeMed + addlMed + fit + sit);
  const totalER = round2(erSS + erMed + sutaEr);
  const net = round2(gross - totalEE);

  return {
    gross: round2(gross),
    fit,
    eeSocialSecurity: eeSS,
    erSocialSecurity: erSS,
    eeMedicare: eeMed,
    erMedicare: erMed,
    addlMedicare: addlMed,
    sutaEmployer: sutaEr,
    sitEmployee: sit,
    totalEmployeeWithholding: totalEE,
    totalEmployerLiability: totalER,
    netPay: net,
  };
}

