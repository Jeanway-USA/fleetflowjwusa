import { describe, expect, it } from 'vitest';
import { canApprove, reviewItems, suggestedPeriods, totalsOf, type PayRunItem } from '@/lib/payroll/payRun';
import { staffTaxesFor, type StaffTaxContext } from '@/lib/payroll/staffTax';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { EMPTY_YTD, type StateTaxConfig } from '@/lib/payroll/types';
import type { Payee } from '@/lib/tax/records';

const item = (over: Partial<PayRunItem> = {}): PayRunItem => ({
  id: 'i', run_id: 'r', source: 'settlement', source_id: 's', payee_key: 'driver:1', payee_name: 'Dan', gross: 1500, non_taxable: 100, taxes: 275.94, deductions: 50, net: 1274.06, warnings: [], ...over,
});

describe('pay run periods', () => {
  it('drivers are paid for the last Thursday-to-Wednesday week and staff for the last Monday-to-Sunday week', () => {
    // Payday Thursday, October 29, 2026.
    const p = suggestedPeriods(new Date(2026, 9, 29));
    expect(p.driver).toEqual({ start: '2026-10-22', end: '2026-10-28' }); // Thursday to Wednesday, ended yesterday
    expect(p.staff).toEqual({ start: '2026-10-19', end: '2026-10-25' }); // Monday to Sunday
  });
  it('a Friday payday gives the same weeks', () => {
    const p = suggestedPeriods(new Date(2026, 9, 30));
    expect(p.driver.end).toBe('2026-10-28');
    expect(p.staff.end).toBe('2026-10-25');
  });
  it('a payday on a Sunday pays the staff week that ended the Sunday before', () => {
    expect(suggestedPeriods(new Date(2026, 9, 25)).staff.end).toBe('2026-10-18');
  });
});

describe('reviewing a run', () => {
  it('adds up the people, pay, taxes and net', () => {
    const t = totalsOf([item(), item({ payee_key: 'staff:2', gross: 1000, non_taxable: 0, taxes: 150, deductions: 0, net: 850 })]);
    expect(t).toEqual({ people: 2, gross: 2500, nonTaxable: 100, taxes: 425.94, deductions: 50, net: 2124.06 });
  });

  it('a clean run can be approved', () => {
    expect(reviewItems([item()])).toEqual([]);
    expect(canApprove(reviewItems([item()]))).toBe(true);
  });

  it('blocks a run where the net pay does not add up, or is negative', () => {
    expect(canApprove(reviewItems([item({ net: 1300 })]))).toBe(false);
    const neg = reviewItems([item({ gross: 100, non_taxable: 0, taxes: 20, deductions: 200, net: -120 })]);
    expect(neg.some((i) => i.level === 'block' && /negative/.test(i.message))).toBe(true);
  });

  it('blocks a person who appears twice, warns about nothing earned and passes tax warnings along', () => {
    expect(canApprove(reviewItems([item(), item({ id: 'j', source_id: 't' })]))).toBe(false);
    const w = reviewItems([item({ gross: 0, non_taxable: 0, taxes: 0, deductions: 0, net: 0, warnings: ['No Form W-4 on file'] })]);
    expect(w.map((x) => x.level)).toEqual(['warn', 'warn']);
    expect(canApprove(w)).toBe(true);
  });
});

describe('taxes on a staff statement', () => {
  const wa: StateTaxConfig = { state_code: 'WA', suta_rate: 0.0125, suta_wage_base: 78200, has_state_income_tax: false, sit_rate: 0 };
  const ctx: StaffTaxContext = { payees: [], statesByCode: new Map([['WA', wa]]), payFrequency: 'weekly', defaultTaxState: 'WA', headcount: 2 };
  const wanda: Payee = {
    key: 'employee:e1', type: 'employee', id: 'e1', userId: 'u1', firstName: 'Wanda', lastName: 'Office', active: true, employmentClass: 'w2', address: 'x', ssnLast4: '1', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null,
    profile: { payeeId: 'e1', payeeType: 'employee', name: 'Wanda', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'WA', residenceState: 'WA', sitState: 'WA', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false },
  };
  const config = defaultTaxYearConfig(2026);

  it('takes federal tax, Social Security, Medicare and the Washington programs out of a $1,000 week', () => {
    const r = staffTaxesFor({ payee: wanda, taxableGross: 1000, nonTaxable: 0, deductions: 0, config, ctx, ytd: EMPTY_YTD });
    // 78.08 income tax + 62.00 + 14.50 + 8.07 paid leave + 5.80 WA Cares = 168.45
    expect(r.taxWithholding).toBeCloseTo(168.45, 2);
    expect(r.netPay).toBeCloseTo(831.55, 2);
    expect(r.warnings).toEqual([]);
  });

  it('adds reimbursements to take-home pay without taxing them, and takes deductions out after tax', () => {
    const r = staffTaxesFor({ payee: wanda, taxableGross: 1000, nonTaxable: 40, deductions: 25, config, ctx, ytd: EMPTY_YTD });
    expect(r.taxWithholding).toBeCloseTo(168.45, 2);
    expect(r.netPay).toBeCloseTo(1000 + 40 - 25 - 168.45, 2);
  });

  it('a person with no employee record is withheld as single with no adjustments, and the run is told', () => {
    const r = staffTaxesFor({ payee: null, taxableGross: 1000, nonTaxable: 0, deductions: 0, config, ctx, ytd: EMPTY_YTD });
    expect(r.taxWithholding).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/No employee tax record/);
  });
});

describe('W-4 filing status as onboarding saves it', () => {
  it('reads single, married (jointly) and head of household, and withholds separate filers as single', async () => {
    const { normalizeFilingStatus } = await import('@/lib/payroll/profiles');
    expect(normalizeFilingStatus('single')).toBe('single');
    expect(normalizeFilingStatus('married')).toBe('married_joint');
    expect(normalizeFilingStatus('hoh')).toBe('head_of_household');
    expect(normalizeFilingStatus('Head of household')).toBe('head_of_household');
    expect(normalizeFilingStatus('married_separate')).toBe('single');
    expect(normalizeFilingStatus('Married filing separately')).toBe('single');
    expect(normalizeFilingStatus(null)).toBe('single');
  });
});

describe('a package assigned through a login', () => {
  it('belongs to the driver record behind that login, and staff keep theirs', async () => {
    const { attachLoginsToDrivers } = await import('@/lib/pay-packages/generate');
    const a = (over: Record<string, unknown>) => ({ id: 'a', package_id: 'p', driver_id: null, user_id: null, effective_start: '2026-10-01', effective_end: null, ...over }) as any;
    const out = attachLoginsToDrivers([a({ user_id: 'u1' }), a({ user_id: 'u2' }), a({ driver_id: 'd9' })], [{ id: 'd1', user_id: 'u1' }]);
    expect(out.map((x: any) => x.driver_id)).toEqual(['d1', null, 'd9']);
  });
});
