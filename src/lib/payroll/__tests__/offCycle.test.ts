import { describe, expect, it } from 'vitest';
import { summarizeOffCycle, validateOffCycle, type OffCycleLine } from '@/lib/payroll/offCycle';
import { calculatePayrollTaxes } from '@/lib/payroll/taxEngine';
import { staffTaxesFor, type StaffTaxContext } from '@/lib/payroll/staffTax';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD, type PayeeTaxProfile, type StateTaxConfig } from '@/lib/payroll/types';
import type { Payee } from '@/lib/tax/records';

const line = (kind: OffCycleLine['kind'], label: string, amount: number): OffCycleLine => ({ kind, label, amount });
const profile: PayeeTaxProfile = { payeeId: 'p', payeeType: 'driver', name: 'Dan', employmentClass: 'w2', filingStatus: 'head_of_household', multipleJobs: false, dependentsAmount: 500, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'TX', residenceState: 'TX', sitState: 'TX', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false };
const tx: StateTaxConfig = { state_code: 'TX', suta_rate: 0.027, suta_wage_base: 9000, has_state_income_tax: false, sit_rate: 0 };
const config = defaultTaxYearConfig(2026);

describe('off-cycle pay', () => {
  it('adds up each kind of line', () => {
    expect(summarizeOffCycle([line('earning', 'Bonus', 500), line('earning', 'Holiday', 100), line('reimbursement', 'Parking', 24.38), line('deduction', 'Advance', 50)])).toEqual({ earnings: 600, reimbursements: 24.38, deductions: 50 });
  });

  it('will not make a payment with a missing reason, no lines, a zero amount or nothing to pay', () => {
    const ok = [line('earning', 'Bonus', 500)];
    expect(validateOffCycle({ payDate: '2026-11-06', reason: 'Safety bonus', lines: ok })).toBeNull();
    expect(validateOffCycle({ payDate: '', reason: 'x', lines: ok })).toMatch(/pay date/);
    expect(validateOffCycle({ payDate: '2026-11-06', reason: ' ', lines: ok })).toMatch(/why/);
    expect(validateOffCycle({ payDate: '2026-11-06', reason: 'x', lines: [] })).toMatch(/at least one/);
    expect(validateOffCycle({ payDate: '2026-11-06', reason: 'x', lines: [line('earning', 'Bonus', 0)] })).toMatch(/above zero/);
    expect(validateOffCycle({ payDate: '2026-11-06', reason: 'x', lines: [line('deduction', 'Advance', 50)] })).toMatch(/nothing to pay/);
  });

  it('withholds income tax on a bonus at the flat 22% supplemental rate, not annualized like a paycheck', () => {
    const bonus = calculatePayrollTaxes({ grossTaxablePay: 500, profile, config, state: tx, ytd: EMPTY_YTD, payFrequency: 'weekly', supplemental: true });
    const fit = bonus.employeeLines.find((l) => l.key === 'federal_income_tax')!;
    expect(fit.amount).toBe(110); // 22% of 500
    expect(fit.note).toMatch(/Supplemental/);
    expect(bonus.audit.fit.method).toBe('supplemental_flat_22');
    // Social Security and Medicare are unchanged by it.
    expect(bonus.employeeLines.find((l) => l.key === 'social_security')!.amount).toBe(31);
    expect(bonus.employeeLines.find((l) => l.key === 'medicare')!.amount).toBe(7.25);
    // The same $500 as a regular weekly paycheck is annualized and comes to far less: it is a different method.
    const regular = calculatePayrollTaxes({ grossTaxablePay: 500, profile, config, state: tx, ytd: EMPTY_YTD, payFrequency: 'weekly' });
    expect(regular.employeeLines.find((l) => l.key === 'federal_income_tax')!.amount).toBeLessThan(110);
  });

  it('a staff bonus: taxes taken at the supplemental rate and net pay worked out', () => {
    const wa: StateTaxConfig = { state_code: 'WA', suta_rate: 0.009, suta_wage_base: 78200, has_state_income_tax: false, sit_rate: 0 };
    const ctx: StaffTaxContext = { payees: [], statesByCode: new Map([['WA', wa]]), payFrequency: 'weekly', defaultTaxState: 'WA', headcount: 2 };
    const wanda: Payee = { key: 'employee:e', type: 'employee', id: 'e', userId: 'u', firstName: 'Wanda', lastName: 'Office', active: true, employmentClass: 'w2', address: 'x', ssnLast4: '1', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null, profile: { ...profile, payeeType: 'employee', filingStatus: 'single', dependentsAmount: 0, workState: 'WA', residenceState: 'WA', sitState: 'WA' } };
    const r = staffTaxesFor({ payee: wanda, taxableGross: 500, nonTaxable: 20, deductions: 0, config, ctx, ytd: EMPTY_YTD, supplemental: true });
    // 110 income tax + 31 SS + 7.25 Medicare + 4.04 WA paid leave (500 x 1.13% x 71.43%) + 2.90 WA Cares = 155.19
    expect(r.taxWithholding).toBeCloseTo(155.19, 2);
    expect(r.netPay).toBeCloseTo(500 + 20 - 155.19, 2);
  });
});
