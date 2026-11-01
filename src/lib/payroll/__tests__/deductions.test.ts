import { describe, expect, it } from 'vitest';
import { afterTaxDeductions, annualLimitFor, disposableEarnings, garnishmentCaps, preTaxDeductions, type DeductionPlan } from '@/lib/payroll/deductions';

const plan = (over: Partial<DeductionPlan>): DeductionPlan => ({ id: 'p', kind: 'health_insurance', label: 'Health', method: 'flat', amount: 50, startDate: '2026-01-01', collected: 0, ytdThisYear: 0, ...over });
const PAY = '2026-10-29';

describe('before-tax deductions', () => {
  it('health premiums lower income tax, Social Security, Medicare and unemployment pay (Section 125)', () => {
    const r = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ amount: 50 })] });
    expect(r.preTax).toEqual({ fit: 50, fica: 50, futa: 50, state: 50 });
  });

  it('a traditional 401(k) lowers income tax only, as a flat amount or a percent', () => {
    const flat = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ kind: 'retirement_pretax', label: '401(k)', amount: 60 })] });
    expect(flat.preTax).toEqual({ fit: 60, fica: 0, futa: 0, state: 60 });
    const pct = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ kind: 'retirement_pretax', method: 'percent', amount: 5 })] });
    expect(pct.applied[0].amount).toBe(50);
  });

  it('a Roth 401(k) and every after-tax kind lower nothing', () => {
    const r = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ kind: 'retirement_roth', amount: 50 }), plan({ id: 'q', kind: 'loan', amount: 25 })] });
    expect(r.preTax).toEqual({ fit: 0, fica: 0, futa: 0, state: 0 });
    expect(r.applied).toEqual([]);
  });

  it('stops at the 2026 yearly limits: $24,500 for a 401(k), more with a catch-up, $4,400 or $8,750 for an HSA', () => {
    expect(annualLimitFor(plan({ kind: 'retirement_pretax' }))).toBe(24500);
    expect(annualLimitFor(plan({ kind: 'retirement_pretax', catchUp: 'age_50' }))).toBe(32500);
    expect(annualLimitFor(plan({ kind: 'retirement_pretax', catchUp: 'age_60_63' }))).toBe(35750);
    expect(annualLimitFor(plan({ kind: 'hsa' }))).toBe(4400);
    expect(annualLimitFor(plan({ kind: 'hsa', familyCoverage: true }))).toBe(8750);
    expect(annualLimitFor(plan({ kind: 'hsa', familyCoverage: true, catchUp: 'age_55_hsa' }))).toBe(9750);
    expect(annualLimitFor(plan({ kind: 'fsa_health' }))).toBe(3400);
    expect(annualLimitFor(plan({ kind: 'fsa_dependent_care' }))).toBe(7500);
    const r = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ kind: 'retirement_pretax', amount: 100, ytdThisYear: 24450 })] });
    expect(r.applied[0].amount).toBe(50);
    expect(r.warnings[0]).toMatch(/Yearly limit/);
  });

  it('never takes more than the pay, or more than the balance, and skips plans outside their dates', () => {
    const small = preTaxDeductions({ gross: 30, payDate: PAY, plans: [plan({ amount: 50 })] });
    expect(small.applied[0].amount).toBe(30);
    expect(small.preTax.fit).toBe(30);
    const bal = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ amount: 50, totalToCollect: 70, collected: 40 })] });
    expect(bal.applied[0].amount).toBe(30);
    expect(preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ endDate: '2026-09-30' })] }).applied).toEqual([]);
    expect(preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ startDate: '2026-11-01' })] }).applied).toEqual([]);
  });

  it('counts the company share separately, for the W-2 and the cost of payroll', () => {
    const r = preTaxDeductions({ gross: 1000, payDate: PAY, plans: [plan({ kind: 'retirement_pretax', amount: 50, employerAmount: 30 })] });
    expect(r.employerContributions).toBe(30);
  });
});

describe('garnishment limits (15 U.S.C. 1673, DOL Fact Sheet 30)', () => {
  const D = 1224.06; // weekly disposable earnings
  it('disposable earnings leave out voluntary deductions, so only taxes come off', () => {
    expect(disposableEarnings(1500, 275.94)).toBe(D);
  });

  it('a creditor may take the lesser of 25% or the amount over 30 times the minimum wage', () => {
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_creditor' }))).toBe(306.02);
    // $250 disposable: 25% is 62.50 but only 32.50 is above the $217.50 floor.
    expect(garnishmentCaps(250, 'weekly', plan({ kind: 'garnish_creditor' }))).toBe(32.5);
    expect(garnishmentCaps(217.5, 'weekly', plan({ kind: 'garnish_creditor' }))).toBe(0);
    expect(garnishmentCaps(900, 'biweekly', plan({ kind: 'garnish_creditor' }))).toBe(225);
  });

  it('child support: 50% if supporting another family, 60% if not, 5% more when 12 weeks behind', () => {
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_child_support', supportingFamily: true }))).toBe(612.03);
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_child_support', supportingFamily: false }))).toBe(734.44);
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_child_support', supportingFamily: true, arrearsOver12Weeks: true }))).toBe(673.23);
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_child_support', supportingFamily: false, arrearsOver12Weeks: true }))).toBe(795.64);
  });

  it('student loans 15%, and a tax levy takes everything above the exempt amount', () => {
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'garnish_student_loan' }))).toBe(183.61);
    expect(garnishmentCaps(D, 'weekly', plan({ kind: 'tax_levy', levyExemptPerPeriod: 600 }))).toBe(624.06);
    expect(garnishmentCaps(500, 'weekly', plan({ kind: 'tax_levy', levyExemptPerPeriod: 600 }))).toBe(0);
  });
});

describe('after-tax deductions', () => {
  const base = { gross: 1500, available: 1224.06, disposable: 1224.06, payDate: PAY, frequency: 'weekly' as const };
  it('cuts a creditor garnishment to the cap and says so', () => {
    const r = afterTaxDeductions({ ...base, plans: [plan({ kind: 'garnish_creditor', label: 'Judgment', amount: 400 })] });
    expect(r.applied[0].amount).toBe(306.02);
    expect(r.warnings[0]).toMatch(/federal garnishment cap/);
  });

  it('with a child support order, every garnishment together stays inside the support cap', () => {
    const r = afterTaxDeductions({
      ...base,
      plans: [plan({ id: 'cs', kind: 'garnish_child_support', label: 'Support', amount: 500, supportingFamily: true }), plan({ id: 'cr', kind: 'garnish_creditor', label: 'Judgment', amount: 300 })],
    });
    expect(r.applied.map((a) => [a.label, a.amount])).toEqual([['Support', 500], ['Judgment', 112.03]]);
  });

  it('takes garnishments before loans, and stops loans when the balance is paid or the pay runs out', () => {
    const r = afterTaxDeductions({
      ...base, available: 150,
      plans: [plan({ id: 'l', kind: 'loan', label: 'Loan', amount: 200 }), plan({ id: 'g', kind: 'garnish_creditor', label: 'Judgment', amount: 100 }), plan({ id: 'a', kind: 'advance', label: 'Advance', amount: 100, totalToCollect: 30, collected: 0 })],
    });
    // Judgment first (100), then the advance (limited to its 30 balance), then the loan takes what is left (20).
    expect(r.applied.map((a) => [a.label, a.amount])).toEqual([['Judgment', 100], ['Advance', 30], ['Loan', 20]]);
    expect(r.applied.reduce((s, a) => s + a.amount, 0)).toBe(150);
  });

  it('never takes net pay below zero', () => {
    const r = afterTaxDeductions({ ...base, available: 0, plans: [plan({ kind: 'escrow', amount: 100 })] });
    expect(r.applied[0].amount).toBe(0);
  });

  it('percent deductions use the pay before deductions', () => {
    const r = afterTaxDeductions({ ...base, plans: [plan({ kind: 'other_after_tax', method: 'percent', amount: 2 })] });
    expect(r.applied[0].amount).toBe(30);
  });
});

import { calculatePayrollTaxes } from '@/lib/payroll/taxEngine';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD, type PayeeTaxProfile, type StateTaxConfig } from '@/lib/payroll/types';

describe('taxes on pay after before-tax deductions', () => {
  const profile: PayeeTaxProfile = { payeeId: 'p', payeeType: 'driver', name: 'Dan', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'TX', residenceState: 'TX', sitState: 'TX', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false };
  const tx: StateTaxConfig = { state_code: 'TX', suta_rate: 0.027, suta_wage_base: 9000, has_state_income_tax: false, sit_rate: 0 };
  const config = defaultTaxYearConfig(2026);

  it('income tax is figured after insurance and the 401(k); Social Security and Medicare after insurance only', () => {
    // $1,500 pay, $50 health (Section 125), $75 traditional 401(k).
    const pre = preTaxDeductions({ gross: 1500, payDate: PAY, plans: [plan({ amount: 50 }), plan({ id: 'k', kind: 'retirement_pretax', label: '401(k)', method: 'percent', amount: 5 })] });
    expect(pre.preTax).toEqual({ fit: 125, fica: 50, futa: 50, state: 125 });
    const r = calculatePayrollTaxes({ grossTaxablePay: 1500, profile, config, state: tx, ytd: EMPTY_YTD, payFrequency: 'weekly', preTax: pre.preTax });
    const line = (k: string) => r.employeeLines.find((l) => l.key === k)!.amount;
    // Income tax on 1,375: (71,500 - 8,600 = 62,900; 5,800 + 22% x 5,000 = 6,900) / 52 = 132.69
    expect(line('federal_income_tax')).toBeCloseTo(132.69, 2);
    // Social Security and Medicare on 1,450.
    expect(line('social_security')).toBeCloseTo(89.9, 2);
    expect(line('medicare')).toBeCloseTo(21.03, 2);
    // The company pays the same Social Security and Medicare, and unemployment tax on 1,450.
    expect(r.employerLines.find((l) => l.key === 'employer_social_security')!.amount).toBeCloseTo(89.9, 2);
    expect(r.employerLines.find((l) => l.key === 'futa')!.amount).toBeCloseTo(8.7, 2);
    expect(r.employerLines.find((l) => l.key === 'suta')!.amount).toBeCloseTo(39.15, 2);
    expect(r.audit.wages).toEqual({ gross: 1500, fit: 1375, fica: 1450, futa: 1450, state: 1375 });
  });

  it('without deductions nothing changes', () => {
    const r = calculatePayrollTaxes({ grossTaxablePay: 1500, profile, config, state: tx, ytd: EMPTY_YTD, payFrequency: 'weekly' });
    expect(r.audit.wages).toEqual({ gross: 1500, fit: 1500, fica: 1500, futa: 1500, state: 1500 });
  });
});
