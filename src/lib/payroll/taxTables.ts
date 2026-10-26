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

/**
 * 2026 tables, copied from IRS Publication 15-T (2026), section 1, "Percentage Method Tables for Automated Payroll
 * Systems", annual payroll period, Form W-4 from 2020 or later. Each row is: adjusted annual wage at least `over`,
 * tentative amount `base`, plus `rate` of the amount over `over`. The tables do NOT include the standard deduction:
 * Worksheet 1A line 1g subtracts $8,600 ($12,900 if married filing jointly) when the Step 2 box is not checked.
 */
export const WORKSHEET_1A_STANDARD_ADJUSTMENT_2026 = { married_joint: 12900, single: 8600, head_of_household: 8600 } as const;

/** Standard withholding rate schedules (Step 2 box NOT checked). */
const STANDARD_2026: FitTableSet = {
  married_joint: [
    { over: 0, base: 0, rate: 0 },
    { over: 19300, base: 0, rate: 0.1 },
    { over: 44100, base: 2480, rate: 0.12 },
    { over: 120100, base: 11600, rate: 0.22 },
    { over: 230700, base: 35932, rate: 0.24 },
    { over: 422850, base: 82048, rate: 0.32 },
    { over: 531750, base: 116896, rate: 0.35 },
    { over: 788000, base: 206583.5, rate: 0.37 },
  ],
  single: [
    { over: 0, base: 0, rate: 0 },
    { over: 7500, base: 0, rate: 0.1 },
    { over: 19900, base: 1240, rate: 0.12 },
    { over: 57900, base: 5800, rate: 0.22 },
    { over: 113200, base: 17966, rate: 0.24 },
    { over: 209275, base: 41024, rate: 0.32 },
    { over: 263725, base: 58448, rate: 0.35 },
    { over: 648100, base: 192979.25, rate: 0.37 },
  ],
  head_of_household: [
    { over: 0, base: 0, rate: 0 },
    { over: 15550, base: 0, rate: 0.1 },
    { over: 33250, base: 1770, rate: 0.12 },
    { over: 83000, base: 7740, rate: 0.22 },
    { over: 121250, base: 16155, rate: 0.24 },
    { over: 217300, base: 39207, rate: 0.32 },
    { over: 271750, base: 56631, rate: 0.35 },
    { over: 656150, base: 191171, rate: 0.37 },
  ],
};

/** Form W-4 Step 2 checkbox schedules (Step 2 box CHECKED). */
const MULTIPLE_JOBS_2026: FitTableSet = {
  married_joint: [
    { over: 0, base: 0, rate: 0 },
    { over: 16100, base: 0, rate: 0.1 },
    { over: 28500, base: 1240, rate: 0.12 },
    { over: 66500, base: 5800, rate: 0.22 },
    { over: 121800, base: 17966, rate: 0.24 },
    { over: 217875, base: 41024, rate: 0.32 },
    { over: 272325, base: 58448, rate: 0.35 },
    { over: 400450, base: 103291.75, rate: 0.37 },
  ],
  single: [
    { over: 0, base: 0, rate: 0 },
    { over: 8050, base: 0, rate: 0.1 },
    { over: 14250, base: 620, rate: 0.12 },
    { over: 33250, base: 2900, rate: 0.22 },
    { over: 60900, base: 8983, rate: 0.24 },
    { over: 108938, base: 20512, rate: 0.32 },
    { over: 136163, base: 29224, rate: 0.35 },
    { over: 328350, base: 96489.63, rate: 0.37 },
  ],
  head_of_household: [
    { over: 0, base: 0, rate: 0 },
    { over: 12075, base: 0, rate: 0.1 },
    { over: 20925, base: 885, rate: 0.12 },
    { over: 45800, base: 3870, rate: 0.22 },
    { over: 64925, base: 8077.5, rate: 0.24 },
    { over: 112950, base: 19603.5, rate: 0.32 },
    { over: 140175, base: 28315.5, rate: 0.35 },
    { over: 332375, base: 95585.5, rate: 0.37 },
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
  /** The year of the IRS tables in use. Later than `tax_year` means the IRS has not published that year yet. */
  tables_year?: number;
}

/** Years with verified federal tables. A later year uses the newest of these until the IRS publishes its own. */
export const VERIFIED_TABLE_YEARS = [2026] as const;

const SOCIAL_SECURITY_WAGE_BASE_BY_YEAR: Record<number, number> = {
  2024: 168600,
  2025: 176100,
  2026: 184500,
};

/** Standard deduction for 2026 (informational; the withholding method uses Worksheet 1A line 1g instead). */
const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  single: 16100,
  married_joint: 32200,
  head_of_household: 24150,
};

/**
 * Federal figures for a tax year, from IRS Publication 15-T (2026) and Publication 15 (2026).
 * Federal law is kept in code and never read back from an editable database row, so a stale stored copy
 * can never change what is withheld.
 */
export function defaultTaxYearConfig(year: number): TaxYearConfig {
  const tablesYear = Math.max(...VERIFIED_TABLE_YEARS.filter((y) => y <= Math.max(year, VERIFIED_TABLE_YEARS[0])));
  return {
    tax_year: year,
    tables_year: tablesYear,
    fit_tables: STANDARD_2026,
    fit_tables_multiple_jobs: MULTIPLE_JOBS_2026,
    standard_deduction: STANDARD_DEDUCTION_2026,
    dependent_credit_qualifying_child: 2200,
    dependent_credit_other: 500,
    social_security_rate: 0.062,
    social_security_wage_base: SOCIAL_SECURITY_WAGE_BASE_BY_YEAR[year] ?? SOCIAL_SECURITY_WAGE_BASE_BY_YEAR[2026],
    medicare_rate: 0.0145,
    additional_medicare_rate: 0.009,
    additional_medicare_threshold: 200000,
    futa_rate: 0.006,
    futa_wage_base: 7000,
    is_locked: false,
  };
}

export const CURRENT_TAX_YEAR = new Date().getFullYear();
