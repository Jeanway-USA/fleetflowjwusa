import {
  PAY_PERIODS_PER_YEAR,
  TAX_ENGINE_VERSION,
  EMPTY_YTD,
  type PayFrequency,
  type PayeeTaxProfile,
  type PayeeYtd,
  type StateTaxConfig,
  type TaxCalculationResult,
  type TaxLine,
} from './types';
import type { FitBracket, FitTableSet, TaxYearConfig } from './taxTables';

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function lookupBracket(brackets: FitBracket[], adjustedAnnual: number): FitBracket | null {
  if (!brackets?.length) return null;
  const sorted = [...brackets].sort((a, b) => a.over - b.over);
  let match: FitBracket = sorted[0];
  for (const b of sorted) {
    if (adjustedAnnual >= b.over) match = b;
  }
  return match;
}

export interface FitComputation {
  tableSet: 'standard' | 'multiple_jobs';
  annualWages: number;
  adjustedAnnualWage: number;
  bracket: FitBracket | null;
  tentativeAnnualTax: number;
  dependentCredit: number;
  annualTaxAfterCredits: number;
  perPeriod: number;
  extraWithholding: number;
  total: number;
}

/**
 * IRS Pub 15-T, Worksheet 1A — Percentage Method, annual payroll period,
 * Form W-4 from 2020 or later.
 *
 * The annual rate schedules already embed the standard deduction, so it is
 * never subtracted separately here.
 */
export function computeFederalIncomeTax(params: {
  grossTaxablePay: number;
  profile: Pick<
    PayeeTaxProfile,
    'filingStatus' | 'multipleJobs' | 'dependentsAmount' | 'otherIncome' | 'deductions' | 'extraWithholding'
  >;
  config: TaxYearConfig;
  payFrequency: PayFrequency;
}): FitComputation {
  const { profile, config } = params;
  const periods = PAY_PERIODS_PER_YEAR[params.payFrequency] ?? 52;
  const gross = Math.max(0, Number(params.grossTaxablePay) || 0);

  // Step 1 — Adjust the employee's payment amount.
  const annualWages = round2(gross * periods + Math.max(0, profile.otherIncome || 0));
  const adjustedAnnualWage = Math.max(0, round2(annualWages - Math.max(0, profile.deductions || 0)));

  // Step 2 — Figure the tentative withholding amount.
  const useMultipleJobs = !!profile.multipleJobs;
  const tables: FitTableSet = useMultipleJobs
    ? (config.fit_tables_multiple_jobs as FitTableSet)
    : (config.fit_tables as FitTableSet);
  const brackets = tables?.[profile.filingStatus] ?? [];
  const bracket = lookupBracket(brackets, adjustedAnnualWage);
  const tentativeAnnualTax = bracket
    ? Math.max(0, round2(bracket.base + (adjustedAnnualWage - bracket.over) * bracket.rate))
    : 0;

  // Step 3 — Account for tax credits (Form W-4, Step 3).
  const dependentCredit = Math.max(0, Number(profile.dependentsAmount) || 0);
  const annualTaxAfterCredits = Math.max(0, round2(tentativeAnnualTax - dependentCredit));

  // Step 4 — Figure the final amount to withhold.
  const perPeriod = round2(annualTaxAfterCredits / periods);
  const extraWithholding = Math.max(0, Number(profile.extraWithholding) || 0);

  return {
    tableSet: useMultipleJobs ? 'multiple_jobs' : 'standard',
    annualWages,
    adjustedAnnualWage,
    bracket,
    tentativeAnnualTax,
    dependentCredit,
    annualTaxAfterCredits,
    perPeriod,
    extraWithholding,
    total: round2(perPeriod + extraWithholding),
  };
}

/** Approximate per-allowance annual exemption used until per-state tables land. */
export const STATE_ALLOWANCE_VALUE = 2000;

export interface CalculatePayrollTaxParams {
  grossTaxablePay: number;
  /** Non-tax deductions (advances, escrow, insurance, etc.). */
  otherDeductions?: number;
  profile: PayeeTaxProfile;
  config: TaxYearConfig;
  state?: StateTaxConfig | null;
  ytd?: PayeeYtd;
  payFrequency: PayFrequency;
}

/**
 * Single source of truth for every payroll/settlement tax figure in FleetFlow.
 * Contractors return a zero-withholding result so the same code path renders
 * both contractor settlements and W-2 pay stubs.
 */
export function calculatePayrollTaxes(params: CalculatePayrollTaxParams): TaxCalculationResult {
  const gross = Math.max(0, round2(params.grossTaxablePay));
  const otherDeductions = Math.max(0, round2(params.otherDeductions ?? 0));
  const ytd = params.ytd ?? EMPTY_YTD;
  const cfg = params.config;
  const state = params.state ?? null;
  const profile = params.profile;
  const periods = PAY_PERIODS_PER_YEAR[params.payFrequency] ?? 52;

  const baseAudit = {
    engineVersion: TAX_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    taxYear: cfg.tax_year,
    payFrequency: params.payFrequency,
    periodsPerYear: periods,
    employmentClass: profile.employmentClass,
    profile,
    ytdAtCalculation: ytd,
    federalRates: {
      socialSecurityRate: cfg.social_security_rate,
      socialSecurityWageBase: cfg.social_security_wage_base,
      medicareRate: cfg.medicare_rate,
      additionalMedicareRate: cfg.additional_medicare_rate,
      additionalMedicareThreshold: cfg.additional_medicare_threshold,
      futaRate: cfg.futa_rate,
      futaWageBase: cfg.futa_wage_base,
    },
    stateRates: state,
    override: null,
  };

  if (profile.employmentClass !== 'w2') {
    return {
      gross,
      employeeLines: [],
      employerLines: [],
      totalEmployeeWithholding: 0,
      totalEmployerLiability: 0,
      otherDeductions,
      netPay: round2(gross - otherDeductions),
      audit: {
        ...baseAudit,
        fit: {
          method: 'pub15t_percentage_annual',
          tableSet: 'standard',
          annualWages: 0,
          adjustedAnnualWage: 0,
          bracket: null,
          tentativeAnnualTax: 0,
          dependentCredit: 0,
          annualTaxAfterCredits: 0,
          perPeriod: 0,
          extraWithholding: 0,
          total: 0,
        },
        lines: [],
      },
    };
  }

  const employeeLines: TaxLine[] = [];
  const employerLines: TaxLine[] = [];

  // --- Federal income tax (Pub 15-T) ---
  const fit = computeFederalIncomeTax({
    grossTaxablePay: gross,
    profile,
    config: cfg,
    payFrequency: params.payFrequency,
  });
  employeeLines.push({
    key: 'federal_income_tax',
    label: 'Federal income tax',
    amount: fit.total,
    side: 'employee',
    note: fit.bracket
      ? `Pub 15-T ${fit.tableSet === 'multiple_jobs' ? 'multiple-jobs' : 'standard'} table, ${(fit.bracket.rate * 100).toFixed(0)}% bracket over $${fit.bracket.over.toLocaleString()}`
      : 'Pub 15-T percentage method',
  });

  // --- Social Security (wage-base capped, YTD aware) ---
  const ssRemaining = Math.max(0, cfg.social_security_wage_base - Math.max(0, ytd.socialSecurityWages));
  const ssTaxable = round2(Math.min(gross, ssRemaining));
  const eeSS = round2(ssTaxable * cfg.social_security_rate);
  employeeLines.push({
    key: 'social_security',
    label: 'Social Security',
    amount: eeSS,
    rate: cfg.social_security_rate,
    taxableWages: ssTaxable,
    side: 'employee',
    note: ssTaxable < gross ? `Wage base $${cfg.social_security_wage_base.toLocaleString()} reached` : undefined,
  });
  employerLines.push({
    key: 'employer_social_security',
    label: 'Employer Social Security',
    amount: eeSS,
    rate: cfg.social_security_rate,
    taxableWages: ssTaxable,
    side: 'employer',
  });

  // --- Medicare (uncapped) + Additional Medicare (employee only) ---
  const eeMed = round2(gross * cfg.medicare_rate);
  employeeLines.push({
    key: 'medicare',
    label: 'Medicare',
    amount: eeMed,
    rate: cfg.medicare_rate,
    taxableWages: gross,
    side: 'employee',
  });
  employerLines.push({
    key: 'employer_medicare',
    label: 'Employer Medicare',
    amount: eeMed,
    rate: cfg.medicare_rate,
    taxableWages: gross,
    side: 'employer',
  });

  const priorMed = Math.max(0, ytd.medicareWages);
  const overNow = Math.max(0, priorMed + gross - cfg.additional_medicare_threshold);
  const overPrior = Math.max(0, priorMed - cfg.additional_medicare_threshold);
  const addlBase = round2(Math.max(0, overNow - overPrior));
  const addlMed = round2(addlBase * cfg.additional_medicare_rate);
  if (addlMed > 0) {
    employeeLines.push({
      key: 'additional_medicare',
      label: 'Additional Medicare',
      amount: addlMed,
      rate: cfg.additional_medicare_rate,
      taxableWages: addlBase,
      side: 'employee',
      note: `Wages over $${cfg.additional_medicare_threshold.toLocaleString()}`,
    });
  }

  // --- State income tax (employee) ---
  let sit = 0;
  if (state?.has_state_income_tax && state.sit_rate > 0 && !profile.stateExempt) {
    const annualWages = gross * periods;
    const allowanceReduction = Math.max(0, profile.stateAllowances) * STATE_ALLOWANCE_VALUE;
    const annualTaxable = Math.max(0, annualWages - allowanceReduction);
    sit = round2(
      (annualTaxable * state.sit_rate) / periods + Math.max(0, profile.stateAdditionalWithholding),
    );
    employeeLines.push({
      key: 'state_income_tax',
      label: `${state.state_code} income tax`,
      amount: sit,
      rate: state.sit_rate,
      taxableWages: round2(annualTaxable / periods),
      side: 'employee',
      note: profile.stateAllowances
        ? `${profile.stateAllowances} allowance(s) applied`
        : undefined,
    });
  }

  // --- Employer unemployment: FUTA + state SUTA ---
  const futaRemaining = Math.max(0, cfg.futa_wage_base - Math.max(0, ytd.gross));
  const futaTaxable = round2(Math.min(gross, futaRemaining));
  const futa = round2(futaTaxable * cfg.futa_rate);
  if (futa > 0) {
    employerLines.push({
      key: 'futa',
      label: 'FUTA',
      amount: futa,
      rate: cfg.futa_rate,
      taxableWages: futaTaxable,
      side: 'employer',
    });
  }

  let suta = 0;
  if (state && state.suta_rate > 0 && state.suta_wage_base > 0) {
    const remaining = Math.max(0, state.suta_wage_base - Math.max(0, ytd.gross));
    const taxable = round2(Math.min(gross, remaining));
    suta = round2(taxable * state.suta_rate);
    if (suta > 0) {
      employerLines.push({
        key: 'suta',
        label: `${state.state_code} SUTA`,
        amount: suta,
        rate: state.suta_rate,
        taxableWages: taxable,
        side: 'employer',
      });
    }
  }

  const totalEmployeeWithholding = round2(
    employeeLines.reduce((s, l) => s + l.amount, 0),
  );
  const totalEmployerLiability = round2(employerLines.reduce((s, l) => s + l.amount, 0));
  const netPay = round2(gross - totalEmployeeWithholding - otherDeductions);

  return {
    gross,
    employeeLines,
    employerLines,
    totalEmployeeWithholding,
    totalEmployerLiability,
    otherDeductions,
    netPay,
    audit: {
      ...baseAudit,
      fit: {
        method: 'pub15t_percentage_annual',
        tableSet: fit.tableSet,
        annualWages: fit.annualWages,
        adjustedAnnualWage: fit.adjustedAnnualWage,
        bracket: fit.bracket,
        tentativeAnnualTax: fit.tentativeAnnualTax,
        dependentCredit: fit.dependentCredit,
        annualTaxAfterCredits: fit.annualTaxAfterCredits,
        perPeriod: fit.perPeriod,
        extraWithholding: fit.extraWithholding,
        total: fit.total,
      },
      lines: [...employeeLines, ...employerLines],
    },
  };
}

/** Convenience accessor for a single stored line amount. */
export function lineAmount(result: TaxCalculationResult, key: string): number {
  return (
    result.employeeLines.find((l) => l.key === key)?.amount ??
    result.employerLines.find((l) => l.key === key)?.amount ??
    0
  );
}
