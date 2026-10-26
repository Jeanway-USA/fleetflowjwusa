import { stateInfo } from '@/lib/tax/states';
import { monthlyDepositDue, quarterDue, quarterOf, QUARTER_END, QUARTER_START, semiweeklyDepositDue } from '@/lib/tax/dates';
import type { Amounts, Payee, PayRecord } from '@/lib/tax/records';
import { ZERO_AMOUNTS } from '@/lib/tax/records';
import type { TaxYearConfig } from '@/lib/payroll/types';

/**
 * Every figure here is added up from the pay records, so the W-2s, the quarterly returns and the year-end
 * reconciliation can never disagree with one another.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

export function sumAmounts(list: Amounts[]): Amounts {
  const out: Amounts = { ...ZERO_AMOUNTS };
  for (const a of list) for (const k of Object.keys(out) as Array<keyof Amounts>) out[k] = round2(out[k] + a[k]);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// One employee, one year: everything a Form W-2 needs
// ---------------------------------------------------------------------------------------------------------------

export interface W2Data {
  payee: Payee;
  year: number;
  /** Box 1: wages, tips and other compensation. */
  box1: number;
  /** Box 2: federal income tax withheld. */
  box2: number;
  /** Box 3: social security wages (capped at the wage base). */
  box3: number;
  /** Box 4: social security tax withheld. */
  box4: number;
  /** Box 5: Medicare wages and tips. */
  box5: number;
  /** Box 6: Medicare tax withheld, including Additional Medicare Tax. */
  box6: number;
  /** Boxes 15 to 17, one row per state that taxes this person's income. */
  states: Array<{ code: string; wages: number; tax: number }>;
  /** Reimbursements paid under an accountable plan. They are not on the W-2; shown so the owner can see they were excluded. */
  reimbursementsExcluded: number;
  /** Other state payroll programs withheld, for information (Washington paid leave and WA Cares). */
  stateProgramsWithheld: number;
  recordCount: number;
  anyCalculated: boolean;
  problems: string[];
}

export function buildW2(payee: Payee, records: PayRecord[], year: number, cfg: Pick<TaxYearConfig, 'social_security_wage_base'>): W2Data {
  const mine = records.filter((r) => r.payeeKey === payee.key && r.payDate.startsWith(String(year)));
  const total = sumAmounts(mine.map((r) => r.amounts));
  const wages = round2(mine.reduce((s, r) => s + r.wages, 0));
  const reimbursementsExcluded = round2(mine.reduce((s, r) => s + r.nonTaxable, 0));

  // Box 1 is every taxable dollar paid. Boxes 3 and 5 are wages subject to the two taxes: social security stops at the wage base.
  const box3 = round2(Math.min(wages, cfg.social_security_wage_base));
  const box4 = total.ss;
  const box6 = round2(total.medicare + total.addlMedicare);

  const stateRows = new Map<string, { wages: number; tax: number }>();
  for (const r of mine) {
    const code = (r.sitStateCode ?? '').toUpperCase();
    const info = stateInfo(code);
    if (!info || info.sit === 'none') continue;
    const row = stateRows.get(code) ?? { wages: 0, tax: 0 };
    row.wages = round2(row.wages + r.wages);
    row.tax = round2(row.tax + r.amounts.sit);
    stateRows.set(code, row);
  }

  const problems: string[] = [];
  if (wages > 0 && total.ss === 0 && box3 > 0) problems.push('Social security wages are shown but no social security tax was withheld.');
  if (wages > 0 && box6 === 0) problems.push('Medicare wages are shown but no Medicare tax was withheld.');
  // The SSA rejects a report when social security wages (box 3) are less than what the tax implies, or tax with no wages.
  if (box4 > 0 && box3 === 0) problems.push('Social security tax is shown with no social security wages.');
  const expectedSs = round2(box3 * 0.062);
  if (box3 > 0 && Math.abs(expectedSs - box4) > Math.max(1, mine.length * 0.01)) {
    problems.push(`Social security tax withheld ($${box4.toFixed(2)}) is not 6.2% of box 3 ($${expectedSs.toFixed(2)}). Check the pay records before filing.`);
  }
  const expectedMed = round2(wages * 0.0145);
  if (wages > 0 && Math.abs(expectedMed - total.medicare) > Math.max(1, mine.length * 0.01)) {
    problems.push(`Medicare tax withheld ($${total.medicare.toFixed(2)}) is not 1.45% of box 5 ($${expectedMed.toFixed(2)}). Check the pay records before filing.`);
  }

  return {
    payee, year, box1: wages, box2: total.fit, box3, box4, box5: wages, box6,
    states: [...stateRows.entries()].map(([code, v]) => ({ code, ...v })),
    reimbursementsExcluded, stateProgramsWithheld: total.stateEmployeeOther,
    recordCount: mine.length, anyCalculated: mine.some((r) => !r.recorded), problems,
  };
}

/** Everything needed before a W-2 can be printed. Anything missing is something the IRS or SSA would reject. */
export function w2Readiness(w2: W2Data, employerOk: boolean): string[] {
  const missing: string[] = [];
  if (!employerOk) missing.push('Company name, EIN and address');
  if (!w2.payee.address) missing.push('Employee home address');
  if (!w2.payee.ssnLast4) missing.push('Employee Social Security number');
  if (!w2.payee.firstName || !w2.payee.lastName) missing.push('Employee legal name');
  if (!w2.payee.hasW4) missing.push('Form W-4');
  return missing;
}

// ---------------------------------------------------------------------------------------------------------------
// Form 941, one quarter
// ---------------------------------------------------------------------------------------------------------------

export interface Form941 {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  due: string;
  /** Line 1: employees paid in the pay period that includes the 12th of the quarter's last month. */
  line1Employees: number;
  /** Line 2: wages, tips and other compensation. */
  line2Wages: number;
  /** Line 3: federal income tax withheld. */
  line3Fit: number;
  /** Line 5a: taxable social security wages and the tax on them at 12.4%. */
  line5aWages: number;
  line5aTax: number;
  line5cWages: number;
  line5cTax: number;
  /** Line 5d: Additional Medicare Tax (0.9%, employee only). */
  line5dWages: number;
  line5dTax: number;
  line5e: number;
  /** Line 6: total taxes before adjustments. */
  line6: number;
  /** The tax the employees and employer actually owed from the pay records (employee share + employer share). */
  withheldPlusEmployer: number;
  /** Any gap between line 6 and the pay records, which is fractions of cents (line 7). */
  line7Fractions: number;
  /** Pay dates and the tax owed on each, for the deposit schedule. */
  liabilityByDate: Array<{ date: string; amount: number }>;
}

const twelfthOfLastMonth = (year: number, q: number) => `${year}-${String(q * 3).padStart(2, '0')}-12`;

export function buildForm941(records: PayRecord[], year: number, quarter: 1 | 2 | 3 | 4, cfg: Pick<TaxYearConfig, 'social_security_wage_base'>): Form941 {
  const start = `${year}-${QUARTER_START[quarter]}`;
  const end = `${year}-${QUARTER_END[quarter]}`;
  const inQ = records.filter((r) => r.payDate >= start && r.payDate <= end);

  // Social security wages stop at the wage base across the whole year, so look at the year before this quarter.
  const priorByPayee = new Map<string, number>();
  for (const r of records) if (r.payDate >= `${year}-01-01` && r.payDate < start) priorByPayee.set(r.payeeKey, (priorByPayee.get(r.payeeKey) ?? 0) + r.wages);
  const ssWagesByPayee = new Map<string, number>();
  for (const r of [...inQ].sort((a, b) => a.payDate.localeCompare(b.payDate))) {
    const before = (priorByPayee.get(r.payeeKey) ?? 0) + (ssWagesByPayee.get(r.payeeKey) ?? 0);
    const room = Math.max(0, cfg.social_security_wage_base - before);
    ssWagesByPayee.set(r.payeeKey, (ssWagesByPayee.get(r.payeeKey) ?? 0) + Math.min(r.wages, room));
  }
  const ssWages = round2([...ssWagesByPayee.values()].reduce((s, v) => s + v, 0));

  const total = sumAmounts(inQ.map((r) => r.amounts));
  const wages = round2(inQ.reduce((s, r) => s + r.wages, 0));
  const date12 = twelfthOfLastMonth(year, quarter);
  const paidThen = new Set(inQ.filter((r) => (r.periodStart <= date12 && date12 <= r.periodEnd) || r.payDate === date12).map((r) => r.payeeKey));

  const line5aTax = round2(ssWages * 0.124);
  const line5cTax = round2(wages * 0.029);
  const addlWages = round2(total.addlMedicare / 0.009);
  const line5dTax = total.addlMedicare;
  const line5e = round2(line5aTax + line5cTax + line5dTax);
  const line6 = round2(total.fit + line5e);
  const owed = round2(total.fit + total.ss + total.employerSs + total.medicare + total.employerMedicare + total.addlMedicare);

  const byDate = new Map<string, number>();
  for (const r of inQ) {
    const a = r.amounts;
    const owedOnDate = round2(a.fit + a.ss + a.employerSs + a.medicare + a.employerMedicare + a.addlMedicare);
    byDate.set(r.payDate, round2((byDate.get(r.payDate) ?? 0) + owedOnDate));
  }

  return {
    year, quarter, due: quarterDue(year, quarter), line1Employees: paidThen.size, line2Wages: wages, line3Fit: total.fit,
    line5aWages: ssWages, line5aTax, line5cWages: wages, line5cTax, line5dWages: addlWages, line5dTax, line5e, line6,
    withheldPlusEmployer: owed, line7Fractions: round2(owed - line6),
    liabilityByDate: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------------------------------------------

export type DepositSchedule = 'monthly' | 'semiweekly';

export interface DepositScheduleResult {
  schedule: DepositSchedule;
  reason: string;
  /** The tax reported in the lookback period, when there is any history. */
  lookbackTotal: number | null;
}

/**
 * Pub 15: a new employer is a monthly depositor for its first calendar year. After that, the lookback period (July 1
 * two years ago through June 30 last year) decides: $50,000 or less is monthly, more is semiweekly.
 * Without records for the lookback period the answer is "monthly" and the page says why.
 */
export function depositSchedule(allRecords: PayRecord[], year: number, firstPayYear: number | null): DepositScheduleResult {
  if (firstPayYear == null || year <= firstPayYear) {
    return { schedule: 'monthly', reason: 'A new employer is a monthly depositor for its first calendar year.', lookbackTotal: null };
  }
  const from = `${year - 2}-07-01`;
  const to = `${year - 1}-06-30`;
  const inLookback = allRecords.filter((r) => r.payDate >= from && r.payDate <= to);
  const total = round2(inLookback.reduce((s, r) => { const a = r.amounts; return s + a.fit + a.ss + a.employerSs + a.medicare + a.employerMedicare + a.addlMedicare; }, 0));
  const have = allRecords.some((r) => r.payDate < from) || inLookback.length > 0;
  if (!have) return { schedule: 'monthly', reason: 'No pay history is on file for the lookback period, so the monthly schedule is assumed. Confirm with your IRS notices.', lookbackTotal: null };
  return total > 50000
    ? { schedule: 'semiweekly', reason: `Taxes reported in the lookback period (${from} to ${to}) were $${total.toFixed(2)}, more than $50,000.`, lookbackTotal: total }
    : { schedule: 'monthly', reason: `Taxes reported in the lookback period (${from} to ${to}) were $${total.toFixed(2)}, $50,000 or less.`, lookbackTotal: total };
}

export interface Deposit { dueDate: string; amount: number; label: string; }

/** Every federal deposit due for a year, from pay records. */
export function federalDeposits(records: PayRecord[], year: number, schedule: DepositSchedule): Deposit[] {
  const of = records.filter((r) => r.payDate.startsWith(String(year)));
  const liability = (r: PayRecord) => { const a = r.amounts; return round2(a.fit + a.ss + a.employerSs + a.medicare + a.employerMedicare + a.addlMedicare); };
  if (schedule === 'monthly') {
    const byMonth = new Map<number, number>();
    for (const r of of) { const m = Number(r.payDate.slice(5, 7)); byMonth.set(m, round2((byMonth.get(m) ?? 0) + liability(r))); }
    return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([m, amount]) => ({
      dueDate: monthlyDepositDue(year, m), amount, label: `Payroll taxes for ${new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}`,
    }));
  }
  const byDue = new Map<string, number>();
  for (const r of of) { const due = semiweeklyDepositDue(r.payDate); byDue.set(due, round2((byDue.get(due) ?? 0) + liability(r))); }
  return [...byDue.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dueDate, amount]) => ({ dueDate, amount, label: 'Payroll taxes for pay dates in that week' }));
}

// ---------------------------------------------------------------------------------------------------------------
// Form 940 (federal unemployment tax), the year
// ---------------------------------------------------------------------------------------------------------------

export interface Form940 {
  year: number;
  /** Line 3: total payments to all employees. */
  line3Total: number;
  /** Line 5: payments over $7,000 per employee. */
  line5OverBase: number;
  /** Line 7: total taxable FUTA wages. */
  line7Taxable: number;
  /** Line 8: FUTA tax before adjustments (0.6% when state unemployment tax is paid on time). */
  line8Tax: number;
  /** FUTA credit reduction for states that owe the federal government (Schedule A), when set. */
  creditReduction: Array<{ state: string; wages: number; rate: number; amount: number }>;
  line12Total: number;
}

/**
 * FUTA wages are the first $7,000 paid to each employee. The standard credit (5.4%) assumes state unemployment tax was paid
 * on time. Credit reduction states owe more: the rate for each is announced by the Department of Labor in November,
 * so it is entered, never assumed.
 */
export function buildForm940(records: PayRecord[], year: number, futaWageBase: number, creditReductionByState: Record<string, number> = {}): Form940 {
  const of = records.filter((r) => r.payDate.startsWith(String(year)));
  const byPayee = new Map<string, { wages: number; state: string }>();
  for (const r of of) {
    const row = byPayee.get(r.payeeKey) ?? { wages: 0, state: (r.stateCode ?? '').toUpperCase() };
    row.wages += r.wages;
    byPayee.set(r.payeeKey, row);
  }
  let total = 0;
  let taxable = 0;
  const stateWages = new Map<string, number>();
  for (const v of byPayee.values()) {
    total += v.wages;
    const t = Math.min(v.wages, futaWageBase);
    taxable += t;
    stateWages.set(v.state, (stateWages.get(v.state) ?? 0) + t);
  }
  const creditReduction = Object.entries(creditReductionByState)
    .filter(([, rate]) => rate > 0)
    .map(([state, rate]) => { const wages = round2(stateWages.get(state) ?? 0); return { state, wages, rate, amount: round2(wages * rate) }; })
    .filter((c) => c.wages > 0);
  const line8 = round2(taxable * 0.006);
  return {
    year, line3Total: round2(total), line5OverBase: round2(total - taxable), line7Taxable: round2(taxable), line8Tax: line8,
    creditReduction, line12Total: round2(line8 + creditReduction.reduce((s, c) => s + c.amount, 0)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// State quarterly figures
// ---------------------------------------------------------------------------------------------------------------

export interface StateQuarter {
  code: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  employees: number;
  /** Gross wages paid to employees based in this state. */
  grossWages: number;
  /** Wages up to the state's wage base. Only these owe unemployment tax. */
  taxableWages: number;
  excessWages: number;
  rate: number;
  rateAssumed: boolean;
  /** Unemployment tax owed to the state for the quarter. */
  suiDue: number;
  incomeTaxWithheld: number;
  employeeProgramsWithheld: number;
  employerProgramsOwed: number;
  due: string;
}

/** Unemployment tax is figured per employee on wages paid in the state, up to the state's wage base for the year. */
export function buildStateQuarter(records: PayRecord[], year: number, quarter: 1 | 2 | 3 | 4, code: string, wageBase: number, rate: number, rateAssumed: boolean): StateQuarter {
  const state = code.toUpperCase();
  const mine = records.filter((r) => (r.stateCode ?? '').toUpperCase() === state && r.payDate.startsWith(String(year))).sort((a, b) => a.payDate.localeCompare(b.payDate));
  const start = `${year}-${QUARTER_START[quarter]}`;
  const end = `${year}-${QUARTER_END[quarter]}`;
  const running = new Map<string, number>();
  let gross = 0, taxable = 0;
  const people = new Set<string>();
  const qAmounts: Amounts[] = [];
  for (const r of mine) {
    const before = running.get(r.payeeKey) ?? 0;
    const room = Math.max(0, wageBase - before);
    running.set(r.payeeKey, before + r.wages);
    if (r.payDate >= start && r.payDate <= end) {
      gross += r.wages;
      taxable += Math.min(r.wages, room);
      people.add(r.payeeKey);
      qAmounts.push(r.amounts);
    }
  }
  const sums = sumAmounts(qAmounts);
  const sitRecords = records.filter((r) => (r.sitStateCode ?? '').toUpperCase() === state && r.payDate >= start && r.payDate <= end);
  return {
    code: state, year, quarter, employees: people.size, grossWages: round2(gross), taxableWages: round2(taxable), excessWages: round2(gross - taxable),
    rate, rateAssumed, suiDue: round2(taxable * rate), incomeTaxWithheld: round2(sitRecords.reduce((s, r) => s + r.amounts.sit, 0)),
    employeeProgramsWithheld: sums.stateEmployeeOther, employerProgramsOwed: sums.stateEmployerOther, due: quarterDue(year, quarter),
  };
}

export { quarterOf };
