/**
 * Due dates for payroll filings and deposits. A due date that falls on a Saturday, Sunday or a legal holiday in
 * Washington, D.C. moves to the next day that is not one of those (IRS Publication 15, "Calendar").
 * Dates are plain "YYYY-MM-DD" text and are worked out in UTC, so a time zone can never move a due date.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = utc(year, month, 1);
  const offset = (7 + weekday - first.getUTCDay()) % 7;
  return utc(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utc(year, month + 1, 0);
  return utc(year, month, last.getUTCDate() - ((7 + last.getUTCDay() - weekday) % 7));
}

/** Legal holidays in the District of Columbia for a year (federal holidays plus DC Emancipation Day). */
export function legalHolidays(year: number): Set<string> {
  const set = new Set<string>();
  const add = (d: Date) => set.add(iso(d));
  add(utc(year, 1, 1));
  add(nthWeekday(year, 1, 1, 3)); // Martin Luther King Jr. Day
  add(nthWeekday(year, 2, 1, 3)); // Washington's Birthday
  add(utc(year, 4, 16)); // DC Emancipation Day
  add(lastWeekday(year, 5, 1)); // Memorial Day
  add(utc(year, 6, 19)); // Juneteenth
  add(utc(year, 7, 4));
  add(nthWeekday(year, 9, 1, 1)); // Labor Day
  add(nthWeekday(year, 10, 1, 2)); // Columbus Day
  add(utc(year, 11, 11));
  add(nthWeekday(year, 11, 4, 4)); // Thanksgiving
  add(utc(year, 12, 25));
  if ((year - 2025) % 4 === 0) add(utc(year, 1, 20)); // Inauguration Day
  return set;
}

export function isBusinessDay(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !legalHolidays(d.getUTCFullYear()).has(date);
}

/** Moves a due date forward to the next business day. */
export function rollForward(date: string): string {
  let d = new Date(`${date}T00:00:00Z`);
  while (!isBusinessDay(iso(d))) d = new Date(d.getTime() + 86400000);
  return iso(d);
}

export const addDaysIso = (date: string, days: number) => iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000));

export function quarterOf(date: string): 1 | 2 | 3 | 4 {
  return (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

export const QUARTER_END: Record<number, string> = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
export const QUARTER_START: Record<number, string> = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
/** Form 941 and most state quarterly returns are due on the last day of the month after the quarter ends. */
export const QUARTER_DUE: Record<number, [monthOffsetYear: number, md: string]> = { 1: [0, '04-30'], 2: [0, '07-31'], 3: [0, '10-31'], 4: [1, '01-31'] };

export function quarterDue(year: number, q: 1 | 2 | 3 | 4): string {
  const [plus, md] = QUARTER_DUE[q];
  return rollForward(`${year + plus}-${md}`);
}

/** Monthly depositors deposit by the 15th of the next month. */
export function monthlyDepositDue(year: number, month: number): string {
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  return rollForward(`${y}-${String(m).padStart(2, '0')}-15`);
}

/**
 * Semiweekly depositors: pay dates Wednesday, Thursday and Friday are due the following Wednesday; Saturday, Sunday,
 * Monday and Tuesday are due the following Friday. Holidays push the date forward.
 */
export function semiweeklyDepositDue(payDate: string): string {
  const dow = new Date(`${payDate}T00:00:00Z`).getUTCDay();
  const base = dow >= 3 && dow <= 5 ? addDaysIso(payDate, 7 - dow + 3) : addDaysIso(payDate, (5 - dow + 7) % 7 || 7);
  return rollForward(base);
}

export const formatDateLong = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
