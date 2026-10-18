import { addDays, format, startOfDay } from 'date-fns';

/**
 * How a mechanic's hours are counted and paid. Pay comes from the SHIFT clock (every hour at work, on a job or not);
 * job timers only say where those hours went, so the report can show the gap between the two.
 *
 * Rules, from how hourly shop technicians are normally paid:
 *   - the pay week runs Monday to Sunday;
 *   - hours over 40 in a pay week are overtime, at 1.5 times the rate;
 *   - meal breaks are paid (the company pays for lunch): they are recorded but never taken out of the hours;
 *   - a clock left running is warned about at 10 hours and stopped at 12, then flagged for review.
 */

export const OVERTIME_AFTER_MINUTES = 40 * 60;
export const OVERTIME_MULTIPLIER = 1.5;
export const WARN_AFTER_HOURS = 10;
export const STOP_AFTER_HOURS = 12;

export interface ShiftEntry {
  id: string;
  userId: string;
  userName: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Total minutes spent on meal breaks in this shift (a running meal break counts up to now). */
  mealMinutes: number;
  needsReview?: boolean;
}

export interface JobTimerEntry {
  userId: string;
  workOrderId: string;
  startedAt: string;
  endedAt: string | null;
  needsReview?: boolean;
}

const MS = 60_000;
const minutesBetween = (a: number, b: number) => Math.max(0, (b - a) / MS);

/** The Monday (local midnight) that starts the pay week containing the date. */
export function payWeekStart(date: Date): Date {
  const d = startOfDay(date);
  const sinceMonday = (d.getDay() + 6) % 7;
  return addDays(d, -sinceMonday);
}

export const payWeekLabel = (start: Date) => `${format(start, 'MMM d')} to ${format(addDays(start, 6), 'MMM d, yyyy')}`;

/** Minutes of [start, end] that fall inside the pay week starting at weekStart. */
function overlapMinutes(startedAt: string, endedAt: string | null, weekStart: Date, now: number): number {
  const s = new Date(startedAt).getTime();
  const e = endedAt ? new Date(endedAt).getTime() : now;
  const ws = weekStart.getTime();
  const we = addDays(weekStart, 7).getTime();
  return minutesBetween(Math.max(s, ws), Math.min(e, we));
}

/** Paid minutes of one shift inside a pay week: the whole time from clock in to clock out. Meal breaks are paid. */
export function paidShiftMinutes(shift: ShiftEntry, weekStart: Date, now: number): number {
  return overlapMinutes(shift.startedAt, shift.endedAt, weekStart, now);
}

export interface WeekHours {
  userId: string;
  userName: string | null;
  /** Paid minutes, split at 40 hours. */
  regularMinutes: number;
  overtimeMinutes: number;
  totalMinutes: number;
  /** Minutes on a job timer, and the paid minutes not on any job. */
  jobMinutes: number;
  unassignedMinutes: number;
  /** Entries stopped automatically or otherwise waiting for someone to check them. */
  reviewCount: number;
  /** Job minutes by work order, for the breakdown under each mechanic. */
  byJob: Array<{ workOrderId: string; minutes: number }>;
}

const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
export const toHours = hours;

/** Everyone's hours for one pay week. */
export function summarizeWeek(shifts: ShiftEntry[], timers: JobTimerEntry[], weekStart: Date, now: number): WeekHours[] {
  const people = new Map<string, WeekHours>();
  const get = (userId: string, userName: string | null) => {
    let p = people.get(userId);
    if (!p) {
      p = { userId, userName, regularMinutes: 0, overtimeMinutes: 0, totalMinutes: 0, jobMinutes: 0, unassignedMinutes: 0, reviewCount: 0, byJob: [] };
      people.set(userId, p);
    } else if (!p.userName && userName) p.userName = userName;
    return p;
  };

  for (const shift of shifts) {
    const mins = paidShiftMinutes(shift, weekStart, now);
    const p = get(shift.userId, shift.userName);
    if (mins > 0) {
      p.totalMinutes += mins;
      if (shift.needsReview) p.reviewCount++;
    }
  }
  const jobTotals = new Map<string, Map<string, number>>();
  for (const t of timers) {
    const mins = overlapMinutes(t.startedAt, t.endedAt, weekStart, now);
    if (mins <= 0) continue;
    const p = get(t.userId, null);
    p.jobMinutes += mins;
    if (t.needsReview) p.reviewCount++;
    const perJob = jobTotals.get(t.userId) ?? new Map<string, number>();
    perJob.set(t.workOrderId, (perJob.get(t.workOrderId) ?? 0) + mins);
    jobTotals.set(t.userId, perJob);
  }

  for (const p of people.values()) {
    p.regularMinutes = Math.min(p.totalMinutes, OVERTIME_AFTER_MINUTES);
    p.overtimeMinutes = Math.max(0, p.totalMinutes - OVERTIME_AFTER_MINUTES);
    p.unassignedMinutes = Math.max(0, p.totalMinutes - p.jobMinutes);
    p.byJob = [...(jobTotals.get(p.userId) ?? new Map()).entries()].map(([workOrderId, minutes]) => ({ workOrderId, minutes })).sort((a, b) => b.minutes - a.minutes);
  }
  return [...people.values()].sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? ''));
}

/** What a running clock should show: nothing, a warning at 10 hours, or "stopped" at 12. */
export function runningClockState(startedAt: string, now: number): 'ok' | 'warn' | 'stopped' {
  const h = minutesBetween(new Date(startedAt).getTime(), now) / 60;
  if (h >= STOP_AFTER_HOURS) return 'stopped';
  if (h >= WARN_AFTER_HOURS) return 'warn';
  return 'ok';
}

export interface HourlyPay {
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  total: number;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Hourly pay for a week's paid minutes: straight time to 40 hours, then 1.5 times. */
export function hourlyPay(rate: number, regularMinutes: number, overtimeMinutes: number): HourlyPay {
  const regularHours = hours(regularMinutes);
  const overtimeHours = hours(overtimeMinutes);
  const regularPay = round2(rate * regularHours);
  const overtimePay = round2(rate * OVERTIME_MULTIPLIER * overtimeHours);
  return { regularHours, overtimeHours, regularPay, overtimePay, total: round2(regularPay + overtimePay) };
}

/** The report as CSV, one row per mechanic. */
export function hoursCsv(rows: WeekHours[], weekStart: Date): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Pay week', 'Mechanic', 'Regular hours', 'Overtime hours', 'Total paid hours', 'Hours on jobs', 'Hours not on a job', 'Entries to review'].map(esc).join(',')];
  for (const r of rows) {
    lines.push([payWeekLabel(weekStart), r.userName ?? 'Unnamed', hours(r.regularMinutes), hours(r.overtimeMinutes), hours(r.totalMinutes), hours(r.jobMinutes), hours(r.unassignedMinutes), r.reviewCount].map(esc).join(','));
  }
  return lines.join('\n');
}

/** A pay period that starts on a Monday and ends on a Sunday, a whole number of weeks long. Hourly pay needs this so overtime is right. */
export function isWholePayWeeks(periodStart: string, periodEnd: string): boolean {
  const s = new Date(`${periodStart}T00:00:00`);
  const e = new Date(`${periodEnd}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return false;
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return s.getDay() === 1 && e.getDay() === 0 && days % 7 === 0;
}

/** One person's paid hours over a period of whole pay weeks, split into straight time and overtime week by week. */
export function periodPaidHours(shifts: ShiftEntry[], userId: string, periodStart: string, periodEnd: string, now: number): { regularHours: number; overtimeHours: number; reviewCount: number } {
  const mine = shifts.filter((s) => s.userId === userId);
  let regular = 0;
  let overtime = 0;
  let review = 0;
  const last = new Date(`${periodEnd}T00:00:00`);
  for (let w = new Date(`${periodStart}T00:00:00`); w <= last; w = addDays(w, 7)) {
    const row = summarizeWeek(mine, [], w, now)[0];
    if (!row) continue;
    regular += row.regularMinutes;
    overtime += row.overtimeMinutes;
    review += row.reviewCount;
  }
  return { regularHours: toHours(regular), overtimeHours: toHours(overtime), reviewCount: review };
}
