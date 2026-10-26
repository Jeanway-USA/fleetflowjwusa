import { describe, expect, it } from 'vitest';
import { assembleTaxHub } from '@/lib/tax/hub';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { resolveState, STATE_CODES } from '@/lib/tax/states';
import { ZERO_AMOUNTS, type Payee, type PayRecord } from '@/lib/tax/records';
import type { StateTaxConfig } from '@/lib/payroll/types';

const profile = (id: string, type: 'driver' | 'employee', state: string) => ({
  payeeId: id, payeeType: type, name: id, employmentClass: 'w2' as const, filingStatus: 'single' as const, multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0,
  workState: state, residenceState: state, sitState: state, stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false,
});
const dan: Payee = { key: 'driver:d1', type: 'driver', id: 'd1', firstName: 'Dan', lastName: 'Driver', active: true, employmentClass: 'w2', address: '1 Oak St, Dallas, TX 75001', ssnLast4: '1111', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null, profile: profile('d1', 'driver', 'TX') };
const wanda: Payee = { key: 'employee:e1', type: 'employee', id: 'e1', firstName: 'Wanda', lastName: 'Office', active: true, employmentClass: 'w2', address: '2 Pine St, Seattle, WA 98101', ssnLast4: '2222', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null, profile: profile('e1', 'employee', 'WA') };

const rec = (p: Payee, payDate: string, wages: number, nonTaxable: number, source: PayRecord['source'], state: string): PayRecord => ({
  id: `${p.key}-${payDate}`, source, payeeKey: p.key, payeeType: p.type, payeeId: p.id, payDate, periodStart: payDate, periodEnd: payDate, wages, nonTaxable,
  amounts: { ...ZERO_AMOUNTS }, stateCode: state, sitStateCode: state, recorded: false, notes: [],
});

const config = defaultTaxYearConfig(2026);
const statesByCode = new Map<string, StateTaxConfig>(STATE_CODES.map((c) => {
  const r = resolveState(c, null)!;
  return [c, { state_code: c, suta_rate: r.sutaRate, suta_wage_base: r.sutaWageBase, has_state_income_tax: false, sit_rate: 0, rate_assumed: r.rateAssumed }];
}));

// A Texas driver paid $1,500 a week for three weeks, and a Washington office employee paid $1,000 a week for two.
const records = [
  rec(dan, '2026-01-09', 1500, 100, 'settlement', 'TX'), rec(dan, '2026-01-16', 1500, 100, 'settlement', 'TX'), rec(dan, '2026-01-23', 1500, 100, 'settlement', 'TX'),
  rec(wanda, '2026-01-09', 1000, 0, 'staff', 'WA'), rec(wanda, '2026-01-16', 1000, 0, 'staff', 'WA'),
];

const hub = assembleTaxHub({
  year: 2026, payees: [dan, wanda], recordsByYear: [{ year: 2024, records: [] }, { year: 2025, records: [] }, { year: 2026, records }],
  config, statesByCode, payFrequency: 'weekly', saved: [], employer: { name: 'JeanWay LLC', ein: '12-3456789', address_line1: '1 Main', address_line2: null, city: 'Dallas', state: 'TX', zip: '75001' },
});

describe('a small company, end to end', () => {
  it('totals wages and leaves reimbursements out', () => {
    expect(hub.wages).toBe(6500);
    expect(hub.reimbursements).toBe(300);
  });

  it('withholds from the employees exactly as the 2026 IRS method and the state programs say', () => {
    // Dan, each week: income tax 160.19, social security 93.00, Medicare 21.75.  Three weeks.
    // Wanda, each week: income tax 78.08, social security 62.00, Medicare 14.50, WA paid leave 8.07, WA Cares 5.80.  Two weeks.
    expect(hub.totals.fit).toBeCloseTo(3 * 160.19 + 2 * 78.08, 2);
    expect(hub.totals.ss).toBeCloseTo(3 * 93 + 2 * 62, 2);
    expect(hub.totals.medicare).toBeCloseTo(3 * 21.75 + 2 * 14.5, 2);
    expect(hub.totals.stateEmployeeOther).toBeCloseTo(2 * (8.07 + 5.8), 2);
    expect(hub.totals.sit).toBe(0); // Texas and Washington do not tax wages
    expect(hub.employeeTotal).toBeCloseTo(1161.72, 2);
  });

  it('works out what the company pays on top, including Texas unemployment tax at the new-employer rate', () => {
    // Dan: social security and Medicare match the employee's, FUTA 0.6% of 4,500, Texas 2.7% of 4,500.
    // Wanda: social security and Medicare match, FUTA 0.6% of 2,000. Washington sets its rate by industry, so none is assumed.
    expect(hub.totals.employerSs).toBeCloseTo(279 + 124, 2);
    expect(hub.totals.employerMedicare).toBeCloseTo(65.25 + 29, 2);
    expect(hub.totals.futa).toBeCloseTo(27 + 12, 2);
    expect(hub.totals.suta).toBeCloseTo(121.5, 2);
    expect(hub.totals.stateEmployerOther).toBe(0); // under 50 employees: no employer share of Washington paid leave
    expect(hub.employerTotal).toBeCloseTo(657.75, 2);
  });

  it('Form 941 for the quarter agrees with the withholding and the W-2s', () => {
    const q1 = hub.quarters[0];
    expect(q1.line2Wages).toBe(6500);
    expect(q1.line3Fit).toBeCloseTo(636.73, 2);
    expect(q1.line5aTax).toBeCloseTo(806, 2);
    expect(q1.line5cTax).toBeCloseTo(188.5, 2);
    expect(q1.line6).toBeCloseTo(1631.23, 2);
    expect(Math.abs(q1.line7Fractions)).toBeLessThan(0.02);
    const w2Wages = hub.w2s.reduce((s, w) => s + w.box1, 0);
    expect(w2Wages).toBe(q1.line2Wages);
  });

  it('files Texas unemployment tax on the first $9,000 and flags the missing Washington rate', () => {
    const tx = hub.states.find((s) => s.code === 'TX')!;
    expect(tx.quarters[0].taxableWages).toBe(4500);
    expect(tx.quarters[0].suiDue).toBeCloseTo(121.5, 2);
    const titles = hub.issues.map((i) => i.title).join(' | ');
    expect(titles).toMatch(/Washington unemployment rate is needed/);
    expect(hub.issues.find((i) => /Washington unemployment rate/.test(i.title))!.level).toBe('fix');
    // Staff pay carries no saved taxes, so the hub tells the owner it calculated them.
    expect(titles).toMatch(/taxes the hub calculated/);
  });

  it('builds W-2s with no state boxes for people in states that do not tax wages', () => {
    for (const w of hub.w2s) expect(w.states).toEqual([]);
    expect(hub.w2s.map((w) => w.payee.lastName)).toEqual(['Driver', 'Office']);
    expect(hub.w2s[0].box3).toBe(4500);
    expect(hub.w2s[0].problems).toEqual([]);
  });

  it('a new employer deposits monthly, due the 15th of the next month, for the whole month together', () => {
    expect(hub.schedule.schedule).toBe('monthly');
    expect(hub.deposits).toHaveLength(1);
    expect(hub.deposits[0].dueDate).toBe('2026-02-17');
    expect(hub.deposits[0].amount).toBeCloseTo(1631.23, 2);
  });

  it('Form 940 counts the first $7,000 per employee', () => {
    expect(hub.form940.line3Total).toBe(6500);
    expect(hub.form940.line7Taxable).toBe(6500);
    expect(hub.form940.line8Tax).toBe(39);
  });
});
