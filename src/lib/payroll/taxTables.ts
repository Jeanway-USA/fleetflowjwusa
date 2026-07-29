/**
 * IRS Publication 15-T percentage-method tables (annual payroll period,
 * Form W-4 from 2020 or later) plus FICA/FUTA constants.
 *
 * These are the *defaults* used to seed an org's `tax_year_configs` row for a
 * tax year. Once seeded, the stored row is the source of truth so an admin can
 * correct or roll rates forward without a code deploy, and closed years can be
 * locked so historical calculations never shift.
 *
 * NOTE: the annual percentage-method tables already have the standard deduction
 * baked into their thresholds. Do NOT subtract the standard deduction again.
 */

export type FilingStatus = 'single' | 'married_joint' | 'head_of_household';

export interface FitBracket {
  /** Adjusted annual wage amount is over this value. */
  over: number;
  /** Tax on the amount at `over`. */
  base: number;
  /** Marginal rate applied to the excess over `over`. */
  rate: number;
}

export type FitTableSet = Record<FilingStatus, FitBracket[]>;

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single or Married filing separately',
  married_joint: 'Married filing jointly',
  head_of_household: 'Head of household',
};

/** Standard withholding rate schedules (Step 2 checkbox NOT checked). */
const STANDARD_2025: FitTableSet = {
  single: [
    { over: 0, base: 0, rate: 0 },
    { over: 6400, base: 0, rate: 0.1 },
    { over: 18325, base: 1192.5, rate: 0.12 },
    { over: 54875, base: 5578.5, rate: 0.22 },
    { over: 109750, base: 17651, rate: 0.24 },
    { over: 203700, base: 40199, rate: 0.32 },
    { over: 256925, base: 57231, rate: 0.35 },
    { over: 632750, base: 188769.75, rate: 0.37 },
  ],
  married_joint: [
    { over: 0, base: 0, rate: 0 },
    { over: 17100, base: 0, rate: 0.1 },
    { over: 40950, base: 2385, rate: 0.12 },
    { over: 114050, base: 11157, rate: 0.22 },
    { over: 223800, base: 35302, rate: 0.24 },
    { over: 411700, base: 80398, rate: 0.32 },
    { over: 518150, base: 114462, rate: 0.35 },
    { over: 768700, base: 202154.5, rate: 0.37 },
  ],
  head_of_household: [
    { over: 0, base: 0, rate: 0 },
    { over: 13900, base: 0, rate: 0.1 },
    { over: 30900, base: 1700, rate: 0.12 },
    { over: 78750, base: 7442, rate: 0.22 },
    { over: 117250, base: 15912, rate: 0.24 },
    { over: 211200, base: 38460, rate: 0.32 },
    { over: 264400, base: 55484, rate: 0.35 },
    { over: 640250, base: 187031.5, rate: 0.37 },
  ],
};

/** Multiple-jobs rate schedules (Step 2 checkbox CHECKED). */
const MULTIPLE_JOBS_2025: FitTableSet = {
  single: [
    { over: 0, base: 0, rate: 0 },
    { over: 7500, base: 0, rate: 0.1 },
    { over: 13463, base: 596.3, rate: 0.12 },
    { over: 31738, base: 2789.3, rate: 0.22 },
    { over: 59175, base: 8825.44, rate: 0.24 },
    { over: 106150, base: 20099.44, rate: 0.32 },
    { over: 132763, base: 28615.6, rate: 0.35 },
    { over: 320675, base: 94384.8, rate: 0.37 },
  ],
  married_joint: [
    { over: 0, base: 0, rate: 0 },
    { over: 15000, base: 0, rate: 0.1 },
    { over: 26925, base: 1192.5, rate: 0.12 },
    { over: 63475, base: 5578.5, rate: 0.22 },
    { over: 118350, base: 17651, rate: 0.24 },
    { over: 212300, base: 40199, rate: 0.32 },
    { over: 265525, base: 57231, rate: 0.35 },
    { over: 390800, base: 101077.25, rate: 0.37 },
  ],
  head_of_household: [
    { over: 0, base: 0, rate: 0 },
    { over: 11250, base: 0, rate: 0.1 },
    { over: 19750, base: 850, rate: 0.12 },
    { over: 43675, base: 3721, rate: 0.22 },
    { over: 62925, base: 7956, rate: 0.24 },
    { over: 109900, base: 19230, rate: 0.32 },
    { over: 136500, base: 27742, rate: 0.35 },
    { over: 324425, base: 93515.75, rate: 0.37 },
  ],
};

export interface TaxYearConfig {
  tax_year: number;
  fit_tables: FitTableSet;
  fit_tables_multiple_jobs: FitTableSet;
  /** Informational only — the annual tables already embed the standard deduction. */
  standard_deduction: Record<FilingStatus, number>;
  dependent_credit_qualifying_child: number;
  dependent_credit_other: number;
  social_security_rate: number;
  social_security_wage_base: number;
  medicare_rate: number;
  additional_medicare_rate: number;
  additional_medicare_threshold: number;
  futa_rate: number;
  futa_wage_base: number;
  is_locked?: boolean;
}

const SOCIAL_SECURITY_WAGE_BASE_BY_YEAR: Record<number, number> = {
  2024: 168600,
  2025: 176100,
  2026: 184500,
};

const STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  single: 15000,
  married_joint: 30000,
  head_of_household: 22500,
};

/**
 * Default configuration for a tax year. Used to seed `tax_year_configs`.
 * Rate schedules default to the most recent published set; an admin can edit
 * the stored row when the IRS releases new tables.
 */
export function defaultTaxYearConfig(year: number): TaxYearConfig {
  return {
    tax_year: year,
    fit_tables: STANDARD_2025,
    fit_tables_multiple_jobs: MULTIPLE_JOBS_2025,
    standard_deduction: STANDARD_DEDUCTION_2025,
    dependent_credit_qualifying_child: 2000,
    dependent_credit_other: 500,
    social_security_rate: 0.062,
    social_security_wage_base: SOCIAL_SECURITY_WAGE_BASE_BY_YEAR[year] ?? 184500,
    medicare_rate: 0.0145,
    additional_medicare_rate: 0.009,
    additional_medicare_threshold: 200000,
    futa_rate: 0.006,
    futa_wage_base: 7000,
    is_locked: false,
  };
}

export const CURRENT_TAX_YEAR = new Date().getFullYear();
