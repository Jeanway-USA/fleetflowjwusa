import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import type { PayFrequency, StateTaxConfig, TaxYearConfig } from '@/lib/payroll/types';
import { applyEngineToUnrecorded, type Payee, type PayRecord } from '@/lib/tax/records';
import { buildForm940, buildForm941, buildStateQuarter, buildW2, depositSchedule, federalDeposits, sumAmounts, type W2Data } from '@/lib/tax/reports';
import { buildIssues, type StateSaved, type WithholdingCheck } from '@/lib/tax/issues';
import { computeFederalIncomeTax } from '@/lib/payroll/taxEngine';
import { resolveState, stateInfo } from '@/lib/tax/states';
import type { EmployerInfo } from '@/hooks/useTaxHubData';

export interface SavedStateRow extends StateSaved {
  suta_rate: number | null;
  sit_rate: number | null;
  has_state_income_tax: boolean | null;
  deposit_frequency: string | null;
  agency_notes: string | null;
}

/**
 * Works out everything the Tax Hub shows from the people and their pay records. A plain function, so it can be tested
 * with made-up payroll and the screens can never show a number the tests have not checked.
 */
export function assembleTaxHub(input: {
  year: number;
  payees: Payee[];
  recordsByYear: Array<{ year: number; records: PayRecord[] }>;
  config: TaxYearConfig;
  statesByCode: Map<string, StateTaxConfig>;
  payFrequency: PayFrequency;
  saved: SavedStateRow[];
  employer: EmployerInfo | undefined;
}) {
  const { year, payees, recordsByYear, config, statesByCode, payFrequency, saved, employer } = input;
  const headcount = payees.filter((p) => p.employmentClass === 'w2' && p.active).length;

  // Run each year with its own year's figures, oldest first.
  const all: PayRecord[] = [];
  for (const { year: y, records } of recordsByYear) {
    all.push(...applyEngineToUnrecorded(records, payees, { config: defaultTaxYearConfig(y), statesByCode, payFrequency, headcount }));
  }
  const records = all.filter((r) => r.payDate.startsWith(String(year)));
  const firstPayYear = all.length ? Number(all.reduce((m, r) => (r.payDate < m ? r.payDate : m), all[0].payDate).slice(0, 4)) : null;

  const w2People = payees.filter((p) => p.employmentClass === 'w2' && records.some((r) => r.payeeKey === p.key));
  const w2s: W2Data[] = w2People.map((p) => buildW2(p, records, year, config)).sort((a, b) => a.payee.lastName.localeCompare(b.payee.lastName));

  const quarters = ([1, 2, 3, 4] as const).map((q) => buildForm941(records, year, q, config));
  const schedule = depositSchedule(all, year, firstPayYear);
  const deposits = federalDeposits(records, year, schedule.schedule);
  const form940 = buildForm940(records, year, config.futa_wage_base);

  const stateCodes = [...new Set(records.map((r) => (r.stateCode ?? '').toUpperCase()).filter(Boolean))].sort();
  const states = stateCodes.map((code) => {
    const s = saved.find((x) => x.code === code);
    const resolved = resolveState(code, s ? { suta_rate: s.suta_rate, has_state_income_tax: s.has_state_income_tax, sit_rate: s.sit_rate } : null);
    const quartersFor = ([1, 2, 3, 4] as const).map((q) => buildStateQuarter(records, year, q, code, resolved?.sutaWageBase ?? 0, resolved?.sutaRate ?? 0, resolved?.rateAssumed ?? true));
    return { code, info: stateInfo(code), resolved, saved: s ?? null, quarters: quartersFor };
  });

  const totals = sumAmounts(records.map((r) => r.amounts));
  const wages = records.reduce((s, r) => s + r.wages, 0);
  const reimbursements = records.reduce((s, r) => s + r.nonTaxable, 0);
  const employerTotal = totals.employerSs + totals.employerMedicare + totals.futa + totals.suta + totals.stateEmployerOther;
  const employeeTotal = totals.fit + totals.ss + totals.medicare + totals.addlMedicare + totals.sit + totals.stateEmployeeOther;

  // Compare what was actually withheld with what the 2026 method gives, for pay whose withholding was saved at the time.
  const byKey = new Map(payees.map((p) => [p.key, p]));
  const withholdingChecks: WithholdingCheck[] = records
    .filter((r) => r.recorded && r.wages > 0 && byKey.get(r.payeeKey)?.employmentClass === 'w2')
    .map((r) => ({ payeeKey: r.payeeKey, payDate: r.payDate, actual: r.amounts.fit, expected: computeFederalIncomeTax({ grossTaxablePay: r.wages, profile: byKey.get(r.payeeKey)!.profile, config, payFrequency }).total }));

  const issues = buildIssues({ year, employer, payees, records, w2s, savedStates: saved, tablesYear: config.tables_year, withholdingChecks });
  return { payees, records, all, w2s, quarters, schedule, deposits, form940, states, totals, wages, reimbursements, employerTotal, employeeTotal, issues, config, headcount, firstPayYear };
}

export type TaxHubData = ReturnType<typeof assembleTaxHub>;
