/**
 * Wage-law checks for hourly pay: minimum wage and overtime. Pure, no database.
 *
 * Minimum wages are by state and date. A state not listed uses the federal $7.25, and the check says so, because many
 * states and cities pay more. Local city minimums (for example Seattle) are not checked: confirm the work location.
 * Figures: Washington 2025 $16.66 and 2026 $17.13 (L&I); Florida $13.00 to Sept 29 2025, $14.00 to Sept 29 2026, then
 * $15.00 (Amendment 2). Verify these each January with the state before relying on them.
 */

export const FEDERAL_MIN_WAGE = 7.25;

const STATE_MIN_WAGE: Record<string, Array<{ from: string; rate: number }>> = {
  WA: [{ from: '2025-01-01', rate: 16.66 }, { from: '2026-01-01', rate: 17.13 }],
  FL: [{ from: '2024-09-30', rate: 13 }, { from: '2025-09-30', rate: 14 }, { from: '2026-09-30', rate: 15 }],
};

export interface MinimumWage { rate: number; source: 'state' | 'federal'; state: string | null }

/** The minimum hourly wage that applies in a state on a date. */
export function minimumWage(state: string | null | undefined, date: string): MinimumWage {
  const code = (state ?? '').toUpperCase();
  const rows = STATE_MIN_WAGE[code];
  if (rows) {
    const hit = [...rows].reverse().find((r) => r.from <= date);
    if (hit) return { rate: Math.max(hit.rate, FEDERAL_MIN_WAGE), source: 'state', state: code };
  }
  return { rate: FEDERAL_MIN_WAGE, source: 'federal', state: code || null };
}

export interface WageIssue { level: 'block' | 'warn'; message: string }

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Checks one person's hourly week against wage law.
 *  - Overtime hours with no overtime pay in the package would underpay them: blocked.
 *  - Hours worked with no hourly pay in the package: blocked.
 *  - An hourly rate under the minimum wage, or all pay for the hours worked averaging under it: blocked.
 */
export function wageIssues(args: {
  state: string | null | undefined;
  /** The last day of the pay period, to pick the minimum wage in force. */
  date: string;
  regularHours: number;
  overtimeHours: number;
  /** The hourly rate in the package, or null when it has none. */
  hourlyRate: number | null;
  hasOvertimePay: boolean;
  /** All pay for the period that is taxed (wages for the hours worked, plus bonuses). */
  taxableGross: number;
}): WageIssue[] {
  const out: WageIssue[] = [];
  const hours = round2(args.regularHours + args.overtimeHours);
  if (hours <= 0) return out;
  const min = minimumWage(args.state, args.date);
  const where = min.source === 'state' ? `the ${min.state} minimum wage` : `the federal minimum wage${min.state ? ` (${min.state} has no rate on file here, so check it yourself)` : ''}`;

  if (args.overtimeHours > 0 && !args.hasOvertimePay) {
    out.push({ level: 'block', message: `Worked ${args.overtimeHours} overtime hours, but the pay package has no overtime pay, so they would be underpaid. Add the overtime line to their package.` });
  }
  if (args.hourlyRate == null) {
    out.push({ level: 'block', message: `Worked ${hours} hours, but the pay package pays no hourly rate.` });
  } else if (args.hourlyRate + 1e-9 < min.rate) {
    out.push({ level: 'block', message: `The hourly rate of ${money(args.hourlyRate)} is below ${where} of ${money(min.rate)}.` });
  }
  if (args.hourlyRate != null && args.hourlyRate + 1e-9 >= min.rate && args.taxableGross / hours + 1e-9 < min.rate) {
    out.push({ level: 'block', message: `Pay of ${money(args.taxableGross)} for ${hours} hours averages ${money(round2(args.taxableGross / hours))} an hour, below ${where} of ${money(min.rate)}.` });
  }
  return out;
}
