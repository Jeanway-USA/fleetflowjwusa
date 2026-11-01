import { describe, expect, it } from 'vitest';
import { amountsFromSnapshot, ZERO_AMOUNTS, type Payee, type PayRecord } from '@/lib/tax/records';
import { buildForm940, buildForm941, buildStateQuarter, buildW2 } from '@/lib/tax/reports';

const payee: Payee = {
  key: 'driver:1', type: 'driver', id: '1', firstName: 'Dan', lastName: 'Driver', active: true, employmentClass: 'w2', address: '1 Oak St', ssnLast4: '1111', hasW4: true, hasStateForm: true, hasI9: true, hireDate: null,
  profile: { payeeId: '1', payeeType: 'driver', name: 'Dan', employmentClass: 'w2', filingStatus: 'single', multipleJobs: false, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, workState: 'TX', residenceState: 'TX', sitState: 'TX', stateExempt: false, stateAllowances: 0, stateAdditionalWithholding: 0, usedDefaults: false },
};
const cfg = { social_security_wage_base: 184500 };

// Ten weekly pays of $1,500 with $50 health (Section 125) and $75 traditional 401(k) each week.
const week = (n: number): PayRecord => ({
  id: `r${n}`, source: 'settlement', payeeKey: 'driver:1', payeeType: 'driver', payeeId: '1', payDate: `2026-04-${String(n + 3).padStart(2, '0')}`, periodStart: '2026-04-01', periodEnd: '2026-04-07',
  wages: 1500, fitWages: 1375, ficaWages: 1450, futaWages: 1450, stateWages: 1375, box12: { D: 75 }, retirementPlan: true, nonTaxable: 0, stateCode: 'TX', sitStateCode: 'TX', recorded: true, notes: [],
  amounts: { ...ZERO_AMOUNTS, fit: 132.69, ss: 89.9, medicare: 21.03, employerSs: 89.9, employerMedicare: 21.03 },
});
const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(week);

describe('W-2 with before-tax deductions', () => {
  const w2 = buildW2(payee, weeks, 2026, cfg);
  it('box 1 is pay less insurance and the 401(k); boxes 3 and 5 are pay less insurance only', () => {
    expect(w2.box1).toBe(13750); // 10 x 1,375
    expect(w2.box3).toBe(14500); // 10 x 1,450
    expect(w2.box5).toBe(14500);
  });
  it('reports the 401(k) in box 12 code D and checks the retirement plan box', () => {
    expect(w2.box12).toEqual([{ code: 'D', amount: 750 }]);
    expect(w2.retirementPlan).toBe(true);
  });
  it('the tax withheld agrees with the boxes, so nothing is flagged', () => {
    expect(w2.problems).toEqual([]);
  });
});

describe('quarterly and yearly returns with before-tax deductions', () => {
  it('Form 941 line 2 is box 1 pay; Social Security and Medicare wages are the lower figure', () => {
    const q2 = buildForm941(weeks, 2026, 2, cfg);
    expect(q2.line2Wages).toBe(13750);
    expect(q2.line5aWages).toBe(14500);
    expect(q2.line5cWages).toBe(14500);
    expect(q2.line5aTax).toBeCloseTo(1798, 2); // 14,500 x 12.4%
    expect(q2.line5cTax).toBeCloseTo(420.5, 2); // 14,500 x 2.9%
  });
  it('Form 940 counts the pay after Section 125 deductions, up to $7,000', () => {
    const f = buildForm940(weeks, 2026, 7000);
    expect(f.line3Total).toBe(15000);
    expect(f.line7Taxable).toBe(7000);
    expect(f.line8Tax).toBe(42);
  });
  it('state unemployment tax is on the same pay as federal unemployment tax', () => {
    const q = buildStateQuarter(weeks, 2026, 2, 'TX', 9000, 0.027, true);
    expect(q.grossWages).toBe(14500);
    expect(q.taxableWages).toBe(9000);
    expect(q.suiDue).toBe(243);
  });
});

describe('reading saved deductions back', () => {
  it('finds the box 12 amounts and the pay each tax was figured on in a saved calculation', () => {
    const snap = {
      lines: [{ key: 'medicare', side: 'employee', amount: 21.03, taxableWages: 1450 }, { key: 'federal_income_tax', side: 'employee', amount: 132.69 }],
      wages: { gross: 1500, fit: 1375, fica: 1450, futa: 1450, state: 1375 },
      payrollDeductions: [{ kind: 'retirement_pretax', amount: 75, employerAmount: 30 }, { kind: 'hsa', amount: 40, employerAmount: 10 }, { kind: 'loan', amount: 25, employerAmount: 0 }],
    };
    const r = amountsFromSnapshot(snap)!;
    expect(r).toMatchObject({ wages: 1500, fitWages: 1375, ficaWages: 1450, futaWages: 1450, stateWages: 1375, retirementPlan: true });
    expect(r.box12).toEqual({ D: 75, W: 50 }); // the HSA code W includes the company's share
  });
  it('an older saved calculation with no deduction details reads as before: every tax on the full pay', () => {
    const r = amountsFromSnapshot({ lines: [{ key: 'medicare', side: 'employee', amount: 21.75, taxableWages: 1500 }] })!;
    expect(r).toMatchObject({ wages: 1500, fitWages: 1500, ficaWages: 1500, futaWages: 1500, stateWages: 1500, box12: {}, retirementPlan: false });
  });
});
