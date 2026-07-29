import type { FilingStatus, TaxYearConfig } from './taxTables';

export type { FilingStatus, TaxYearConfig };

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export const PAY_PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly (52)',
  biweekly: 'Bi-weekly (26)',
  semimonthly: 'Semi-monthly (24)',
  monthly: 'Monthly (12)',
};

export type EmploymentClass = 'w2' | 'contractor';

/**
 * Generic payee shape. Drivers resolve into this today; a future `employees`
 * table (dispatchers, office, mechanics) resolves into the exact same shape,
 * so the engine, ledger and reporting need no changes to support them.
 */
export interface PayeeTaxProfile {
  payeeId: string;
  payeeType: 'driver' | 'employee';
  name: string;
  employmentClass: EmploymentClass;
  /** Federal W-4 (2020+) values. */
  filingStatus: FilingStatus;
  multipleJobs: boolean;
  dependentsAmount: number;
  otherIncome: number;
  deductions: number;
  extraWithholding: number;
  /** State withholding form values. */
  workState: string | null;
  residenceState: string | null;
  stateExempt: boolean;
  stateAllowances: number;
  stateAdditionalWithholding: number;
  /** True when no W-4 record exists and defaults were assumed. */
  usedDefaults: boolean;
}

export interface StateTaxConfig {
  state_code: string;
  suta_rate: number;
  suta_wage_base: number;
  has_state_income_tax: boolean;
  sit_rate: number;
}

export interface PayeeYtd {
  /** Gross taxable wages paid year-to-date, before this run. */
  gross: number;
  /** Social Security wages year-to-date (for wage-base cap). */
  socialSecurityWages: number;
  /** Medicare wages year-to-date (for the additional-Medicare threshold). */
  medicareWages: number;
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;
  stateIncomeTax: number;
  net: number;
}

export const EMPTY_YTD: PayeeYtd = {
  gross: 0,
  socialSecurityWages: 0,
  medicareWages: 0,
  federalIncomeTax: 0,
  socialSecurityTax: 0,
  medicareTax: 0,
  additionalMedicareTax: 0,
  stateIncomeTax: 0,
  net: 0,
};

export interface TaxLine {
  key: string;
  label: string;
  amount: number;
  /** Rate applied, when a flat rate drives the line. */
  rate?: number;
  /** Wages the rate was applied to. */
  taxableWages?: number;
  /** Human-readable note, e.g. the bracket row used. */
  note?: string;
  side: 'employee' | 'employer';
}

export interface TaxCalculationResult {
  gross: number;
  employeeLines: TaxLine[];
  employerLines: TaxLine[];
  totalEmployeeWithholding: number;
  totalEmployerLiability: number;
  otherDeductions: number;
  netPay: number;
  /** Immutable audit snapshot persisted alongside the pay record. */
  audit: TaxAuditSnapshot;
}

export interface TaxAuditSnapshot {
  engineVersion: string;
  calculatedAt: string;
  taxYear: number;
  payFrequency: PayFrequency;
  periodsPerYear: number;
  employmentClass: EmploymentClass;
  profile: PayeeTaxProfile;
  ytdAtCalculation: PayeeYtd;
  federalRates: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: number;
    futaRate: number;
    futaWageBase: number;
  };
  stateRates: StateTaxConfig | null;
  fit: {
    method: 'pub15t_percentage_annual';
    tableSet: 'standard' | 'multiple_jobs';
    annualWages: number;
    adjustedAnnualWage: number;
    bracket: { over: number; base: number; rate: number } | null;
    tentativeAnnualTax: number;
    dependentCredit: number;
    annualTaxAfterCredits: number;
    perPeriod: number;
    extraWithholding: number;
    total: number;
  };
  lines: TaxLine[];
  override?: {
    field: string;
    computed: number;
    applied: number;
    reason: string;
    byUserId: string | null;
  } | null;
}

export const TAX_ENGINE_VERSION = '2.0.0';
