import { describe, expect, it } from 'vitest';
import { monthlyDepositDue, quarterDue, rollForward, semiweeklyDepositDue } from '@/lib/tax/dates';
import { buildForm940, buildForm941, buildStateQuarter, buildW2, depositSchedule, federalDeposits } from '@/lib/tax/reports';
import { resolveState, stateInfo } from '@/lib/tax/states';
import { ZERO_AMOUNTS, type Payee, type PayRecord } from '@/lib/tax/records';

describe('due dates', () => {
  it('rolls a weekend or holiday due date to the next business day', () => {
    expect(quarterDue(2026, 1)).toBe('2026-04-30');
    expect(quarterDue(2026, 2)).toBe('2026-07-31');
    // October 31, 2026 is a Saturday.
    expect(quarterDue(2026, 3)).toBe('2026-11-02');
    // January 31, 2027 is a Sunday: the IRS says 2026 W-2s are due February 1, 2027.
    expect(quarterDue(2026, 4)).toBe('2027-02-01');
    // February 15, 2026 is a Sunday and Monday the 16th is a federal holiday (Presidents Day).
    expect(monthlyDepositDue(2026, 1)).toBe('2026-02-17');
    expect(monthlyDepositDue(2026, 12)).toBe('2027-01-15');
    expect(rollForward('2026-07-04')).toBe('2026-07-06');
  });

  it('semiweekly deposits: Wed-Fri pay is due the next Wednesday, Sat-Tue pay the next Friday', () => {
    // Pub 15 (2026): pay on Wednesday, September 30, 2026 is due Wednesday, October 7, 2026.
    expect(semiweeklyDepositDue('2026-09-30')).toBe('2026-10-07');
    expect(semiweeklyDepositDue('2026-10-02')).toBe('2026-10-07'); // Friday
    expect(semiweeklyDepositDue('2026-10-03')).toBe('2026-10-09'); // Saturday
    expect(semiweeklyDepositDue('2026-10-05')).toBe('2026-10-09'); // Monday
  });
});

describe('state facts', () => {
  it('knows which states have no wage income tax', () => {
    for (const c of ['TX', 'WA', 'FL', 'NV', 'TN', 'AK', 'SD', 'WY', 'NH']) expect(stateInfo(c)!.sit).toBe('none');
    for (const c of ['CA', 'GA', 'NY', 'IL']) expect(stateInfo(c)!.sit).toBe('manual');
  });
  it('has published 2026 wage bases', () => {
    expect(stateInfo('TX')!.suiWageBase).toBe(9000);
    expect(stateInfo('WA')!.suiWageBase).toBe(78200);
  });
  it('uses the owner-entered rate when there is one, otherwise the new-employer rate', () => {
    expect(resolveState('TX', { suta_rate: 0 })).toMatchObject({ sutaRate: 0.027, rateAssumed: true, rateMissing: false });
    expect(resolveState('TX', { suta_rate: 0.0145 })).toMatchObject({ sutaRate: 0.0145, rateAssumed: false });
    expect(resolveState('WA', null)).toMatchObject({ rateMissing: true });
  });
});

const payee = (key: string, over: Partial<Payee> = {}): Payee => ({
  key, type: key.startsWith('driver') ? 'driver' : 'employee', id: key.split(':')[1], firstName: 'A', lastName: 'B', active: true, employmentClass: 'w2',
  address: '1 Main St', ssnLast4: '1234', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null,
  profile: { payeeId: key, payeeType: 'driver', name: 'A B', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'TX', residenceState: 'TX', sitState: 'TX', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false },
  ...over,
});

const rec = (key: string, payDate: string, wages: number, over: Partial<PayRecord> = {}, amounts: Partial<PayRecord['amounts']> = {}): PayRecord => ({
  id: `${key}-${payDate}`, source: 'settlement', payeeKey: key, payeeType: 'driver', payeeId: key.split(':')[1], payDate, periodStart: payDate, periodEnd: payDate,
  wages, nonTaxable: 0, stateCode: 'TX', sitStateCode: 'TX', recorded: true, notes: [],
  amounts: { ...ZERO_AMOUNTS, fit: wages * 0.1, ss: +(wages * 0.062).toFixed(2), employerSs: +(wages * 0.062).toFixed(2), medicare: +(wages * 0.0145).toFixed(2), employerMedicare: +(wages * 0.0145).toFixed(2), ...amounts },
  ...over,
});
const cfg = { social_security_wage_base: 184500 };

describe('W-2 boxes', () => {
  it('adds up the year from the pay records and caps social security wages at the wage base', () => {
    const rows = [rec('driver:1', '2026-03-06', 100000), rec('driver:1', '2026-09-04', 100000)];
    const w2 = buildW2(payee('driver:1'), rows, 2026, cfg);
    expect(w2.box1).toBe(200000);
    expect(w2.box3).toBe(184500);
    expect(w2.box5).toBe(200000);
    expect(w2.states).toEqual([]); // Texas has no state income tax: boxes 15 to 17 stay empty
  });

  it('counts pay by the day it was paid, so December pay paid in January belongs to the new year', () => {
    const rows = [rec('driver:1', '2026-12-30', 1000), rec('driver:1', '2027-01-05', 1000, { periodEnd: '2026-12-31' })];
    expect(buildW2(payee('driver:1'), rows, 2026, cfg).box1).toBe(1000);
    expect(buildW2(payee('driver:1'), rows, 2027, cfg).box1).toBe(1000);
  });

  it('leaves reimbursements off the W-2 and reports state income tax only for a state that has one', () => {
    const rows = [rec('driver:1', '2026-03-06', 1000, { nonTaxable: 250, sitStateCode: 'GA' }, { sit: 40 })];
    const w2 = buildW2(payee('driver:1'), rows, 2026, cfg);
    expect(w2.box1).toBe(1000);
    expect(w2.reimbursementsExcluded).toBe(250);
    expect(w2.states).toEqual([{ code: 'GA', wages: 1000, tax: 40 }]);
  });

  it('flags tax figures that do not match the wages', () => {
    const rows = [rec('driver:1', '2026-03-06', 1000, {}, { ss: 10 })];
    expect(buildW2(payee('driver:1'), rows, 2026, cfg).problems.join(' ')).toMatch(/6\.2%/);
  });
});

describe('Form 941', () => {
  it('adds the quarter and splits tax into social security, Medicare and income tax withheld', () => {
    const rows = [rec('driver:1', '2026-04-03', 1000), rec('driver:1', '2026-04-10', 1000), rec('driver:1', '2026-07-03', 500)];
    const q2 = buildForm941(rows, 2026, 2, cfg);
    expect(q2.line2Wages).toBe(2000);
    expect(q2.line3Fit).toBe(200);
    expect(q2.line5aTax).toBeCloseTo(248, 2); // 2,000 x 12.4%
    expect(q2.line5cTax).toBeCloseTo(58, 2); // 2,000 x 2.9%
    expect(q2.line6).toBeCloseTo(506, 2);
    expect(q2.liabilityByDate).toHaveLength(2);
  });
});

describe('deposits', () => {
  it('a new employer deposits monthly in its first year', () => {
    expect(depositSchedule([], 2026, 2026).schedule).toBe('monthly');
  });

  it('after the first year, more than $50,000 in the lookback period means semiweekly', () => {
    // Lookback for 2027 is July 1, 2025 to June 30, 2026.
    const big = [rec('driver:1', '2026-02-06', 400000, {}, { fit: 60000 })];
    expect(depositSchedule(big, 2027, 2025).schedule).toBe('semiweekly');
    const small = [rec('driver:1', '2026-02-06', 10000)];
    expect(depositSchedule(small, 2027, 2025).schedule).toBe('monthly');
  });

  it('monthly deposits are due on the 15th of the next month', () => {
    const rows = [rec('driver:1', '2026-01-09', 1000), rec('driver:1', '2026-01-16', 1000)];
    const d = federalDeposits(rows, 2026, 'monthly');
    expect(d).toHaveLength(1);
    expect(d[0].dueDate).toBe('2026-02-17');
  });
});

describe('Form 940', () => {
  it('taxes the first $7,000 per employee at 0.6%', () => {
    const rows = [rec('driver:1', '2026-02-06', 20000), rec('driver:2', '2026-02-06', 3000)];
    const f = buildForm940(rows, 2026, 7000);
    expect(f.line3Total).toBe(23000);
    expect(f.line7Taxable).toBe(10000);
    expect(f.line5OverBase).toBe(13000);
    expect(f.line8Tax).toBe(60);
  });
  it('adds credit reduction only for the states that owe it and only on wages paid there', () => {
    const rows = [rec('driver:1', '2026-02-06', 20000, { stateCode: 'CA' }), rec('driver:2', '2026-02-06', 3000)];
    const f = buildForm940(rows, 2026, 7000, { CA: 0.012 });
    expect(f.creditReduction).toEqual([{ state: 'CA', wages: 7000, rate: 0.012, amount: 84 }]);
    expect(f.line12Total).toBe(144);
  });
});

describe('state unemployment tax', () => {
  it('is figured per employee on wages up to the state wage base for the year', () => {
    const rows = [rec('driver:1', '2026-01-09', 8000), rec('driver:1', '2026-04-10', 8000), rec('driver:2', '2026-04-10', 2000)];
    const q1 = buildStateQuarter(rows, 2026, 1, 'TX', 9000, 0.027, true);
    expect(q1.taxableWages).toBe(8000);
    const q2 = buildStateQuarter(rows, 2026, 2, 'TX', 9000, 0.027, true);
    // driver 1 has 1,000 of room left, driver 2 has all 2,000: 3,000 taxable out of 10,000 paid.
    expect(q2.grossWages).toBe(10000);
    expect(q2.taxableWages).toBe(3000);
    expect(q2.excessWages).toBe(7000);
    expect(q2.suiDue).toBe(81);
    expect(q2.employees).toBe(2);
  });
});
