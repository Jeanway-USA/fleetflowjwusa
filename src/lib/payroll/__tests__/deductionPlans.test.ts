import { describe, expect, it } from 'vitest';
import { staffTaxesFor, type StaffTaxContext } from '@/lib/payroll/staffTax';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD } from '@/lib/payroll/types';
import type { DeductionPlan } from '@/lib/payroll/deductions';
import type { Payee } from '@/lib/tax/records';

const payee: Payee = {
  key: 'employee:1', type: 'employee', id: '1', userId: 'u1', firstName: 'Ella', lastName: 'Staff', active: true, employmentClass: 'w2', address: '1 Oak St', ssnLast4: '1111', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null,
  profile: { payeeId: '1', payeeType: 'employee', name: 'Ella', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'TX', residenceState: 'TX', sitState: 'TX', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false },
};
const ctx: StaffTaxContext = { payees: [payee], statesByCode: new Map(), payFrequency: 'weekly', defaultTaxState: 'TX', headcount: 5 };
const config = defaultTaxYearConfig(2026);
const base = { id: 'p', label: 'x', method: 'flat' as const, startDate: '2026-01-01', collected: 0, ytdThisYear: 0 };
const plan = (o: Partial<DeductionPlan> & Pick<DeductionPlan, 'kind' | 'amount'>): DeductionPlan => ({ ...base, ...o });
const run = (plans: DeductionPlan[]) => staffTaxesFor({ payee, taxableGross: 1500, nonTaxable: 0, deductions: 0, config, ctx, ytd: EMPTY_YTD, plans, payDate: '2026-10-29' });

describe('standing deductions on a pay statement', () => {
  const none = run([]);

  it('without plans nothing changes', () => {
    expect(none.applied).toEqual([]);
    expect(none.planTotal).toBe(0);
  });

  it('health insurance lowers income tax and Social Security and Medicare', () => {
    const r = run([plan({ id: 'h', kind: 'health_insurance', amount: 50, label: 'Health' })]);
    const line = (calc: any, key: string) => calc.lines.find((l: any) => l.key === key && l.side === 'employee').amount;
    expect(r.planTotal).toBe(50);
    expect(line(r.calculation, 'social_security')).toBeCloseTo(line(none.calculation, 'social_security') - 50 * 0.062, 2);
    expect(line(r.calculation, 'medicare')).toBeCloseTo(line(none.calculation, 'medicare') - 50 * 0.0145, 1);
    expect(line(r.calculation, 'federal_income_tax')).toBeLessThan(line(none.calculation, 'federal_income_tax'));
    expect((r.calculation as any).wages).toMatchObject({ gross: 1500, fit: 1450, fica: 1450, futa: 1450 });
  });

  it('a traditional 401(k) lowers income tax only', () => {
    const r = run([plan({ id: 'k', kind: 'retirement_pretax', amount: 100, label: '401(k)' })]);
    expect((r.calculation as any).wages).toMatchObject({ gross: 1500, fit: 1400, fica: 1500 });
  });

  it('net pay is pay less taxes less every deduction, and the saved calculation lists them', () => {
    const r = run([plan({ id: 'h', kind: 'health_insurance', amount: 50, label: 'Health' }), plan({ id: 'l', kind: 'loan', amount: 40, label: 'Loan' })]);
    expect(r.planTotal).toBe(90);
    expect(r.netPay).toBeCloseTo(1500 - 90 - r.taxWithholding, 2);
    expect((r.calculation as any).payrollDeductions.map((d: any) => [d.kind, d.amount, d.preTax])).toEqual([['health_insurance', 50, true], ['loan', 40, false]]);
  });

  it('a garnishment is limited by the federal cap on pay left after tax', () => {
    const r = run([plan({ id: 'g', kind: 'garnish_creditor', amount: 900, label: 'Court order' })]);
    const disposable = 1500 - r.taxWithholding;
    expect(r.applied[0].amount).toBeCloseTo(Math.min(disposable * 0.25, disposable - 217.5), 2);
    expect(r.warnings.join(' ')).toMatch(/cap/i);
  });

  it('a loan stops at the balance still owed', () => {
    const r = run([plan({ id: 'l', kind: 'loan', amount: 100, label: 'Loan', totalToCollect: 250, collected: 200 })]);
    expect(r.applied[0].amount).toBe(50);
  });

  it('a plan that has not started, or has ended, takes nothing', () => {
    const r = run([plan({ id: 'a', kind: 'loan', amount: 30, startDate: '2026-11-01' }), plan({ id: 'b', kind: 'loan', amount: 30, endDate: '2026-10-01' })]);
    expect(r.planTotal).toBe(0);
  });
});
