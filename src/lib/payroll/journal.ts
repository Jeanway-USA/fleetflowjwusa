import type { StubData, StubLine } from '@/lib/payroll/stubs';

/**
 * Accounting side of a pay run, from the same saved pay as the stubs and the register (so it cannot disagree with them).
 * Pure: no database. Account names are plain words; map them to your accounting software's accounts when you import.
 */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (lines: StubLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

export interface JournalLine { account: string; debit: number; credit: number }
export interface Journal {
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  /** Debits equal credits. Anything else means a figure on a stub is wrong. */
  balanced: boolean;
}

/** One journal entry for a set of stubs (usually one run). Debits are what the pay cost; credits are who is owed or paid. */
export function journalFor(stubs: StubData[]): Journal {
  const acc = new Map<string, { debit: number; credit: number }>();
  const add = (account: string, side: 'debit' | 'credit', amount: number) => {
    if (!amount) return;
    const cur = acc.get(account) ?? { debit: 0, credit: 0 };
    cur[side] = round2(cur[side] + amount);
    acc.set(account, cur);
  };
  for (const s of stubs) {
    add(s.payeeKind === 'Driver' ? 'Driver pay expense' : 'Wages and salaries expense', 'debit', s.gross);
    add('Reimbursements', 'debit', s.nonTaxable);
    add('Employer payroll tax expense', 'debit', sum(s.employerTaxes));
    add('Employer benefit expense', 'debit', sum(s.employerBenefits));

    for (const t of s.taxes) add(`Payroll tax withheld payable: ${t.label}`, 'credit', t.amount);
    for (const t of s.employerTaxes) add(`Employer payroll tax payable: ${t.label}`, 'credit', t.amount);
    for (const b of s.employerBenefits) add(`Employer benefit payable: ${b.label}`, 'credit', b.amount);
    for (const d of s.deductions) add(`Deductions payable: ${d.label}`, 'credit', d.amount);
    add('Net pay (cash or payroll clearing)', 'credit', s.net);
  }
  const lines = Array.from(acc, ([account, v]) => ({ account, ...v }));
  // Expenses first, then what is owed, then the net pay.
  const order = (a: string) => (a.endsWith('expense') || a === 'Reimbursements' ? 0 : a.startsWith('Net pay') ? 2 : 1);
  lines.sort((a, b) => order(a.account) - order(b.account) || a.account.localeCompare(b.account));
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { lines, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.005 };
}

// ---------------------------------------------------------------------------------------------------------------
// What is owed to the tax agencies
// ---------------------------------------------------------------------------------------------------------------

export interface LiabilityRow {
  group: string;
  /** What was taken from people's pay. */
  employee: number;
  /** What the company owes on top. */
  employer: number;
  total: number;
  /** Where it is paid. */
  note: string;
}

const GROUPS: Array<{ group: string; keys: string[]; note: string }> = [
  { group: 'Federal income tax, Social Security and Medicare', keys: ['federal_income_tax', 'social_security', 'employer_social_security', 'medicare', 'employer_medicare', 'additional_medicare'], note: 'Deposited to the IRS and reported on Form 941' },
  { group: 'Federal unemployment (FUTA)', keys: ['futa'], note: 'Paid to the IRS, reported on Form 940' },
  { group: 'State income tax withheld', keys: ['state_income_tax'], note: 'Paid to the state' },
  { group: 'State unemployment (SUTA)', keys: ['suta'], note: 'Paid to the state each quarter' },
  { group: 'Washington Paid Family and Medical Leave and WA Cares', keys: ['wa_pfml', 'wa_pfml_employer', 'wa_cares'], note: 'Paid to Washington ESD' },
];

/** Pure: what is owed to each tax agency for a set of stubs. Taxes the list does not know are shown as "Other taxes". */
export function taxLiability(stubs: StubData[]): { rows: LiabilityRow[]; total: number } {
  const rows = new Map<string, LiabilityRow>();
  const row = (group: string, note: string) => {
    if (!rows.has(group)) rows.set(group, { group, employee: 0, employer: 0, total: 0, note });
    return rows.get(group)!;
  };
  const place = (l: StubLine, side: 'employee' | 'employer') => {
    const g = GROUPS.find((x) => l.key && x.keys.includes(l.key));
    const r = g ? row(g.group, g.note) : row('Other taxes', 'Check what these are before paying');
    r[side] = round2(r[side] + l.amount);
    r.total = round2(r.employee + r.employer);
  };
  for (const s of stubs) {
    s.taxes.forEach((l) => place(l, 'employee'));
    s.employerTaxes.forEach((l) => place(l, 'employer'));
  }
  const order = GROUPS.map((g) => g.group);
  const list = Array.from(rows.values()).sort((a, b) => (order.indexOf(a.group) === -1 ? 99 : order.indexOf(a.group)) - (order.indexOf(b.group) === -1 ? 99 : order.indexOf(b.group)));
  return { rows: list, total: round2(list.reduce((s, r) => s + r.total, 0)) };
}
