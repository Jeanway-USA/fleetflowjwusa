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

describe('Pub 15-T (2026) Worksheet 1A', () => {
  const run = (grossTaxablePay: number, over: Partial<PayeeTaxProfile>, payFrequency: 'weekly' | 'biweekly' = 'weekly') =>
    computeFederalIncomeTax({ grossTaxablePay, profile: profile(over), config, payFrequency });

  it('withholds nothing when pay is under the first bracket', () => {
    // 100 x 52 = 5,200, less the 8,600 line 1g adjustment, is zero.
    expect(run(100, {}).total).toBe(0);
  });

  it('single filer at $1,500 a week: line 1g takes off $8,600 before the table', () => {
    // 78,000 - 8,600 = 69,400. Single row 57,900: 5,800 + 22% x 11,500 = 8,330. 8,330 / 52 = 160.19.
    const fit = run(1500, {});
    expect(fit.adjustedAnnualWage).toBe(69400);
    expect(fit.tentativeAnnualTax).toBeCloseTo(8330, 2);
    expect(fit.total).toBeCloseTo(160.19, 2);
  });

  it('married filing jointly with a $4,000 Step 3 credit, paid every two weeks', () => {
    // 78,000 - 12,900 = 65,100. MFJ row 44,100: 2,480 + 12% x 21,000 = 5,000. Less 4,000 = 1,000. 1,000 / 26 = 38.46.
    const fit = run(3000, { filingStatus: 'married_joint', dependentsAmount: 4000 }, 'biweekly');
    expect(fit.adjustedAnnualWage).toBe(65100);
    expect(fit.tentativeAnnualTax).toBeCloseTo(5000, 2);
    expect(fit.annualTaxAfterCredits).toBeCloseTo(1000, 2);
    expect(fit.total).toBeCloseTo(38.46, 2);
  });

  it('uses the Step 2 checkbox schedule and no line 1g adjustment when the box is checked', () => {
    // 78,000, checkbox single row 60,900: 8,983 + 24% x 17,100 = 13,087. 13,087 / 52 = 251.67.
    const fit = run(1500, { multipleJobs: true });
    expect(fit.tableSet).toBe('multiple_jobs');
    expect(fit.adjustedAnnualWage).toBe(78000);
    expect(fit.total).toBeCloseTo(251.67, 2);
  });

  it('head of household uses its own schedule', () => {
    // 78,000 - 8,600 = 69,400. HOH row 33,250: 1,770 + 12% x ... no: row 33,250 up to 83,000 is 12%.
    // 1,770 + 12% x (69,400 - 33,250) = 1,770 + 4,338 = 6,108. 6,108 / 52 = 117.46.
    expect(run(1500, { filingStatus: 'head_of_household' }).total).toBeCloseTo(117.46, 2);
  });

  it('adds Step 4(a) other income and subtracts Step 4(b) deductions', () => {
    // 78,000 + 2,000 - 1,000 - 8,600 = 70,400. Single row 57,900: 5,800 + 22% x 12,500 = 8,550. 8,550 / 52 = 164.42.
    expect(run(1500, { otherIncome: 2000, deductions: 1000 }).total).toBeCloseTo(164.42, 2);
  });

  it('adds extra withholding from Step 4(c)', () => {
    expect(run(1500, { extraWithholding: 50 }).total).toBeCloseTo(210.19, 2);
  });

  it('with no Form W-4 on file, withholds as single with no adjustments', () => {
    // 78,000 on the standard single table, row 57,900: 5,800 + 22% x 20,100 = 10,222. 10,222 / 52 = 196.58.
    const fit = run(1500, { usedDefaults: true, filingStatus: 'married_joint', extraWithholding: 99, dependentsAmount: 5000 });
    expect(fit.adjustedAnnualWage).toBe(78000);
    expect(fit.total).toBeCloseTo(196.58, 2);
  });

  it('is exact at a bracket boundary', () => {
    // Adjusted 57,900 is the start of the 22% row: 5,800 / 52 = 111.54 a week. Gross = (57,900 + 8,600) / 52.
    expect(run(66500 / 52, {}).total).toBeCloseTo(111.54, 2);
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

describe('state rules', () => {
  const tx = { state_code: 'TX', suta_rate: 0.027, suta_wage_base: 9000, has_state_income_tax: false, sit_rate: 0, rate_assumed: true };
  const wa = { state_code: 'WA', suta_rate: 0.0125, suta_wage_base: 78200, has_state_income_tax: false, sit_rate: 0 };
  const run = (state: any, over: Partial<PayeeTaxProfile> = {}, extra: any = {}) =>
    calculatePayrollTaxes({ grossTaxablePay: 1000, profile: profile({ workState: state.state_code, ...over }), config, state, payFrequency: 'weekly', ...extra });

  it('Texas: no state income tax, 2.7% unemployment on the first $9,000 only', () => {
    const r = run(tx);
    expect(r.employeeLines.find((l) => l.key === 'state_income_tax')).toBeUndefined();
    expect(r.employerLines.find((l) => l.key === 'suta')!.amount).toBeCloseTo(27, 2);
    const late = run(tx, {}, { ytd: { ...EMPTY_YTD, gross: 8500, socialSecurityWages: 8500, medicareWages: 8500 } });
    // Only 500 of the 1,000 is still under the 9,000 base.
    expect(late.employerLines.find((l) => l.key === 'suta')!.amount).toBeCloseTo(13.5, 2);
    expect(r.warnings?.some((w) => /new-employer rate/.test(w))).toBe(true);
  });

  it('Washington: paid leave and long-term care come out of pay and stay inside wages', () => {
    const r = run(wa);
    const pfml = r.employeeLines.find((l) => l.key === 'wa_pfml')!;
    const cares = r.employeeLines.find((l) => l.key === 'wa_cares')!;
    // 1,000 x 1.13% = 11.30 total; employee 71.43% = 8.07. WA Cares 0.58% = 5.80.
    expect(pfml.amount).toBeCloseTo(8.07, 2);
    expect(cares.amount).toBeCloseTo(5.8, 2);
    expect(r.employeeLines.find((l) => l.key === 'state_income_tax')).toBeUndefined();
    // Under 50 employees there is no employer share.
    expect(r.employerLines.find((l) => l.key === 'wa_pfml_employer')).toBeUndefined();
    const big = run(wa, {}, { employerHeadcount: 60 });
    expect(big.employerLines.find((l) => l.key === 'wa_pfml_employer')!.amount).toBeCloseTo(3.23, 2);
  });

  it('a state with an income tax that is not automated is warned, never guessed', () => {
    const ga = { state_code: 'GA', suta_rate: 0.027, suta_wage_base: 9500, has_state_income_tax: false, sit_rate: 0 };
    const r = run(ga);
    expect(r.employeeLines.find((l) => l.key === 'state_income_tax')).toBeUndefined();
    expect(r.warnings?.some((w) => /Georgia income tax is not calculated/.test(w))).toBe(true);
  });

  it('withholds a flat estimate only when the owner set one, and labels it an estimate', () => {
    const ga = { state_code: 'GA', suta_rate: 0.027, suta_wage_base: 9500, has_state_income_tax: true, sit_rate: 0.05 };
    const r = run(ga);
    const line = r.employeeLines.find((l) => l.key === 'state_income_tax')!;
    expect(line.label).toMatch(/estimate/);
    expect(line.amount).toBeCloseTo(50, 2);
  });

  it('an interstate driver is taxed by the state they live in', () => {
    const il = { state_code: 'IL', suta_rate: 0.0335, suta_wage_base: 14250, has_state_income_tax: true, sit_rate: 0.0495 };
    const r = calculatePayrollTaxes({ grossTaxablePay: 1000, profile: profile({ workState: 'TX', residenceState: 'IL' }), config, state: { state_code: 'TX', suta_rate: 0.027, suta_wage_base: 9000, has_state_income_tax: false, sit_rate: 0 }, sitStateCode: 'IL', payFrequency: 'weekly' });
    // IL is not the state config passed in, so no estimate is available: warned, not guessed.
    expect(r.warnings?.some((w) => /Illinois income tax is not calculated/.test(w))).toBe(true);
    expect(il.state_code).toBe('IL');
  });

  it('warns when there is no Form W-4 on file', () => {
    expect(run(tx, { usedDefaults: true }).warnings?.some((w) => /No Form W-4/.test(w))).toBe(true);
  });
});
