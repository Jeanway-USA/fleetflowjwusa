import { describe, it, expect } from 'vitest';
import { calculatePayrollTaxes, computeFederalIncomeTax } from '@/lib/payroll/taxEngine';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD, type PayeeTaxProfile } from '@/lib/payroll/types';

const config = defaultTaxYearConfig(2026);

const profile = (over: Partial<PayeeTaxProfile> = {}): PayeeTaxProfile => ({
  payeeId: 'p1',
  payeeType: 'driver',
  name: 'Test Driver',
  employmentClass: 'w2',
  filingStatus: 'single',
  multipleJobs: false,
  dependentsAmount: 0,
  otherIncome: 0,
  deductions: 0,
  extraWithholding: 0,
  workState: 'FL',
  residenceState: 'FL',
  stateExempt: false,
  stateAllowances: 0,
  stateAdditionalWithholding: 0,
  usedDefaults: false,
  ...over,
});

describe('Pub 15-T percentage method', () => {
  it('withholds nothing below the first bracket', () => {
    const fit = computeFederalIncomeTax({
      grossTaxablePay: 100,
      profile: profile(),
      config,
      payFrequency: 'weekly',
    });
    expect(fit.total).toBe(0);
  });

  it('matches the single-filer worksheet for $1,500/week', () => {
    // Annual 78,000 → bracket over 54,875: 5,578.50 + 22% * 23,125 = 10,666.00
    const fit = computeFederalIncomeTax({
      grossTaxablePay: 1500,
      profile: profile(),
      config,
      payFrequency: 'weekly',
    });
    expect(fit.adjustedAnnualWage).toBe(78000);
    expect(fit.tentativeAnnualTax).toBeCloseTo(10666, 2);
    expect(fit.total).toBeCloseTo(205.12, 2);
  });

  it('applies the married-joint table and dependent credits', () => {
    const fit = computeFederalIncomeTax({
      grossTaxablePay: 3000,
      profile: profile({ filingStatus: 'married_joint', dependentsAmount: 4000 }),
      config,
      payFrequency: 'biweekly',
    });
    // Annual 78,000 → 2,385 + 12% * 37,050 = 6,831; minus 4,000 credit = 2,831
    expect(fit.tentativeAnnualTax).toBeCloseTo(6831, 2);
    expect(fit.annualTaxAfterCredits).toBeCloseTo(2831, 2);
    expect(fit.total).toBeCloseTo(108.88, 2);
  });

  it('uses the multiple-jobs table when Step 2 is checked', () => {
    const std = computeFederalIncomeTax({
      grossTaxablePay: 1500,
      profile: profile(),
      config,
      payFrequency: 'weekly',
    });
    const multi = computeFederalIncomeTax({
      grossTaxablePay: 1500,
      profile: profile({ multipleJobs: true }),
      config,
      payFrequency: 'weekly',
    });
    expect(multi.total).toBeGreaterThan(std.total);
  });

  it('adds extra withholding on top', () => {
    const fit = computeFederalIncomeTax({
      grossTaxablePay: 1500,
      profile: profile({ extraWithholding: 50 }),
      config,
      payFrequency: 'weekly',
    });
    expect(fit.total).toBeCloseTo(255.12, 2);
  });
});

describe('FICA and net pay', () => {
  it('calculates SS and Medicare at statutory rates', () => {
    const r = calculatePayrollTaxes({
      grossTaxablePay: 1000,
      profile: profile(),
      config,
      state: null,
      ytd: EMPTY_YTD,
      payFrequency: 'weekly',
    });
    const ss = r.employeeLines.find((l) => l.key === 'social_security')!;
    const med = r.employeeLines.find((l) => l.key === 'medicare')!;
    expect(ss.amount).toBeCloseTo(62, 2);
    expect(med.amount).toBeCloseTo(14.5, 2);
  });

  it('stops Social Security at the wage base', () => {
    const r = calculatePayrollTaxes({
      grossTaxablePay: 5000,
      profile: profile(),
      config,
      ytd: { ...EMPTY_YTD, gross: 183000, socialSecurityWages: 183000, medicareWages: 183000 },
      payFrequency: 'weekly',
    });
    const ss = r.employeeLines.find((l) => l.key === 'social_security')!;
    // Only 1,500 of the 5,000 remains under the 184,500 base.
    expect(ss.taxableWages).toBeCloseTo(1500, 2);
    expect(ss.amount).toBeCloseTo(93, 2);
  });

  it('applies additional Medicare above the threshold', () => {
    const r = calculatePayrollTaxes({
      grossTaxablePay: 10000,
      profile: profile(),
      config,
      ytd: { ...EMPTY_YTD, gross: 195000, socialSecurityWages: 195000, medicareWages: 195000 },
      payFrequency: 'weekly',
    });
    const addl = r.employeeLines.find((l) => l.key === 'additional_medicare')!;
    expect(addl.taxableWages).toBeCloseTo(5000, 2);
    expect(addl.amount).toBeCloseTo(45, 2);
  });

  it('withholds nothing for contractors', () => {
    const r = calculatePayrollTaxes({
      grossTaxablePay: 2500,
      otherDeductions: 250,
      profile: profile({ employmentClass: 'contractor' }),
      config,
      payFrequency: 'weekly',
    });
    expect(r.totalEmployeeWithholding).toBe(0);
    expect(r.netPay).toBeCloseTo(2250, 2);
  });

  it('nets gross minus taxes minus other deductions', () => {
    const r = calculatePayrollTaxes({
      grossTaxablePay: 1500,
      otherDeductions: 100,
      profile: profile(),
      config,
      payFrequency: 'weekly',
    });
    expect(r.netPay).toBeCloseTo(1500 - r.totalEmployeeWithholding - 100, 2);
    expect(r.audit.fit.method).toBe('pub15t_percentage_annual');
  });

  it('skips state income tax when the employee is exempt', () => {
    const state = {
      state_code: 'GA',
      suta_rate: 0.027,
      suta_wage_base: 9500,
      has_state_income_tax: true,
      sit_rate: 0.0539,
    };
    const r = calculatePayrollTaxes({
      grossTaxablePay: 1500,
      profile: profile({ stateExempt: true }),
      config,
      state,
      payFrequency: 'weekly',
    });
    expect(r.employeeLines.find((l) => l.key === 'state_income_tax')).toBeUndefined();
  });
});
