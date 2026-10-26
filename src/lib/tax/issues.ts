import { stateInfo } from '@/lib/tax/states';
import type { Payee, PayRecord } from '@/lib/tax/records';
import type { W2Data } from '@/lib/tax/reports';
import type { EmployerInfo } from '@/hooks/useTaxHubData';

/**
 * Everything the owner needs to fix or know before filing, in plain words and in the order that matters.
 * 'fix' blocks a correct filing. 'check' might be wrong. 'note' is good to know.
 */
export type IssueLevel = 'fix' | 'check' | 'note';

export interface Issue {
  level: IssueLevel;
  title: string;
  detail: string;
  /** The person this is about, so their W-2 can say it is not ready. */
  payeeKey?: string;
  /** Where to go to fix it. */
  tab?: 'people' | 'filings' | 'w2' | 'states' | 'overview';
}

export interface WithholdingCheck {
  payeeKey: string;
  payDate: string;
  actual: number;
  expected: number;
}

export interface StateSaved {
  code: string;
  suta_account_number?: string | null;
  sit_account_number?: string | null;
  suta_rate?: number | null;
}

export function buildIssues(input: {
  year: number;
  employer: Pick<EmployerInfo, 'name' | 'ein' | 'address_line1' | 'city' | 'state' | 'zip'> | undefined;
  payees: Payee[];
  records: PayRecord[];
  w2s: W2Data[];
  savedStates: StateSaved[];
  tablesYear: number | undefined;
  /** Paychecks whose saved federal withholding differs from what the IRS method gives today. */
  withholdingChecks?: WithholdingCheck[];
}): Issue[] {
  const out: Issue[] = [];
  const { year, employer, payees, records, w2s, savedStates, tablesYear } = input;

  if (!employer?.name || !employer?.ein || !employer?.address_line1 || !employer?.city || !employer?.state || !employer?.zip) {
    out.push({ level: 'fix', title: 'Company details are incomplete', detail: 'Legal name, EIN and full address print on every W-2 and must match your IRS records exactly.', tab: 'overview' });
  }

  const paid = new Set(records.map((r) => r.payeeKey));
  const w2People = payees.filter((p) => p.employmentClass === 'w2' && (p.active || paid.has(p.key)));
  for (const p of w2People) {
    const name = `${p.firstName} ${p.lastName}`.trim() || 'An employee';
    const missing: string[] = [];
    if (!p.hasW4) missing.push('Form W-4 (federal tax is withheld as single with no adjustments until it is on file)');
    if (!p.hasStateForm) missing.push('state tax form');
    if (!p.hasI9) missing.push('Form I-9');
    if (!p.ssnLast4) missing.push('Social Security number');
    if (!p.address) missing.push('home address');
    if (missing.length > 0) out.push({ level: p.hasW4 ? 'check' : 'fix', title: `${name} is missing paperwork`, detail: missing.join(', '), tab: 'people', payeeKey: p.key });
  }

  // States: only the ones with real wages matter.
  const stateWages = new Map<string, number>();
  const sitStates = new Set<string>();
  for (const r of records) {
    const code = (r.stateCode ?? '').toUpperCase();
    if (code) stateWages.set(code, (stateWages.get(code) ?? 0) + r.wages);
    if (r.sitStateCode) sitStates.add(r.sitStateCode.toUpperCase());
  }
  for (const [code] of stateWages) {
    const info = stateInfo(code);
    const saved = savedStates.find((s) => s.code === code);
    if (!info) { out.push({ level: 'fix', title: `Unknown state code "${code}"`, detail: 'Pay records mention a state the hub does not recognize. Fix the employee\'s state.', tab: 'people' }); continue; }
    if (!(Number(saved?.suta_rate) > 0)) {
      out.push(info.newEmployerRate == null
        ? { level: 'fix', title: `${info.name} unemployment rate is needed`, detail: `${info.name} sets new-employer rates by industry, so none is assumed. Enter the rate from the state's letter so unemployment tax is counted.`, tab: 'states' }
        : { level: 'check', title: `${info.name} unemployment tax uses the new-employer rate`, detail: `The hub is using ${(info.newEmployerRate * 100).toFixed(2)}%. When ${info.name} sends your assigned rate, enter it under States.`, tab: 'states' });
    }
    if (!saved?.suta_account_number) out.push({ level: 'check', title: `${info.name} unemployment account number is not saved`, detail: 'Employers must register with the state and file quarterly. Save the account number under States.', tab: 'states' });
    if (info.confirmWageBase) out.push({ level: 'check', title: `${info.name} wage base needs confirming`, detail: info.note ?? 'Sources disagreed on the 2026 wage base.', tab: 'states' });
    for (const prog of info.programs.filter((x) => x.status === 'manual' && code !== 'WA')) {
      out.push({ level: 'check', title: `${info.name}: ${prog.label} is not calculated`, detail: prog.note, tab: 'states' });
    }
    if (code === 'WA') {
      out.push({ level: 'note', title: 'Washington workers\' compensation is charged by the hour', detail: 'Report hours worked each quarter to the Department of Labor & Industries. The hub does not track hours.', tab: 'states' });
    }
  }
  for (const code of sitStates) {
    const info = stateInfo(code);
    if (info && info.sit === 'manual') {
      out.push({ level: 'fix', title: `${info.name} income tax is not calculated automatically`, detail: `Employees taxed by ${info.name} need state income tax withheld using ${info.name}'s official tables. The hub does not guess it. Until it is withheld, their pay is missing tax.`, tab: 'states' });
    }
  }

  // Pay with no saved withholding. For a paid settlement that means nothing was taken from the check.
  const nameOf = (key: string) => { const p = payees.find((x) => x.key === key); return p ? `${p.firstName} ${p.lastName}`.trim() : 'An employee'; };
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const noWithholding = records.filter((r) => !r.recorded && r.source !== 'staff' && r.wages > 0);
  for (const key of new Set(noWithholding.map((r) => r.payeeKey))) {
    const mine = noWithholding.filter((r) => r.payeeKey === key);
    out.push({ level: 'fix', title: `${nameOf(key)}: ${mine.length} paid check${mine.length === 1 ? ' has' : 's have'} no tax withheld`, detail: `Paid on ${mine.map((r) => day(r.payDate)).join(', ')}. The hub counted the tax that should have been withheld, because the company owes it to the IRS whether or not it was taken from the check. Talk to your accountant about how to handle the difference with the employee.`, tab: 'people', payeeKey: key });
  }
  const staffCalc = records.filter((r) => !r.recorded && r.source === 'staff').length;
  if (staffCalc > 0) out.push({ level: 'check', title: `${staffCalc} staff pay record${staffCalc === 1 ? ' has' : 's have'} taxes the hub calculated`, detail: 'Staff pay statements do not store withholding. The totals use the correct amounts, but make sure what was actually taken from each paycheck matches.', tab: 'overview' });

  for (const w of w2s) for (const problem of w.problems) out.push({ level: 'fix', title: `${w.payee.firstName} ${w.payee.lastName}: ${problem}`, detail: 'The SSA rejects W-2s whose wages and tax do not agree.', tab: 'w2', payeeKey: w.payee.key });

  // The same week paid through two different screens usually means the same pay entered twice.
  const bySource = new Map<string, PayRecord[]>();
  for (const r of records) if (r.wages > 0) bySource.set(r.payeeKey, [...(bySource.get(r.payeeKey) ?? []), r]);
  for (const [key, list] of bySource) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.source !== b.source && a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd) {
          out.push({ level: 'fix', title: `${nameOf(key)}: the same week may be counted twice`, payeeKey: key, detail: `${day(a.periodStart)} to ${day(a.periodEnd)} (${a.source}, $${a.wages.toFixed(2)}) overlaps ${day(b.periodStart)} to ${day(b.periodEnd)} (${b.source}, $${b.wages.toFixed(2)}). If it is one payment, archive one of them so wages and tax are not doubled.`, tab: 'people' });
        }
      }
    }
  }

  const off = (input.withholdingChecks ?? []).filter((c) => Math.abs(c.actual - c.expected) >= 1);
  if (off.length > 0) {
    const net = Math.round(off.reduce((t, c) => t + (c.actual - c.expected), 0) * 100) / 100;
    const worst = off.reduce((m, c) => (Math.abs(c.actual - c.expected) > Math.abs(m.actual - m.expected) ? c : m), off[0]);
    out.push({
      level: 'check',
      title: `${off.length} paycheck${off.length === 1 ? '' : 's'} had federal income tax withheld that differs from the ${year} IRS method`,
      detail: `In total ${net >= 0 ? 'more' : 'less'} was withheld than the IRS method gives: ${Math.abs(net).toFixed(2)}. For example, ${nameOf(worst.payeeKey)} on ${day(worst.payDate)}: ${worst.actual.toFixed(2)} withheld, ${worst.expected.toFixed(2)} by the method. The W-2 and Form 941 report what was actually withheld, so the filings are correct either way. Over-withheld tax comes back to the employee as a refund when they file. Going forward the hub and the payroll screens use the same method. A changed W-4 or a manual override also explains a difference.`,
      tab: 'people',
    });
  }

  if (tablesYear != null && tablesYear < year) {
    out.push({ level: 'note', title: `${year} IRS withholding tables are not published yet`, detail: `The hub is using the ${tablesYear} tables. They will be updated when the IRS publishes Publication 15-T for ${year}.`, tab: 'overview' });
  }
  return out.sort((a, b) => ({ fix: 0, check: 1, note: 2 }[a.level] - { fix: 0, check: 1, note: 2 }[b.level]));
}
