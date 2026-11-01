import { addDays, format, parseISO } from 'date-fns';

/**
 * Paid sick leave and time off rules. Pure, no database.
 *
 * Washington (RCW 49.46.210): one hour of paid sick leave for every 40 hours worked, no cap on what is earned, usable after
 * the 90th day of employment, and at most 40 unused hours need to carry into the next year. Leave is paid at the person's
 * normal hourly rate. The company may be more generous than this, never less. Check the current rule with L&I each year.
 */

export const SICK_HOURS_PER_WORKED = 40;
export const SICK_WAITING_DAYS = 90;
export const SICK_CARRYOVER_CAP = 40;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type TimeOffKind = 'sick' | 'pto' | 'holiday';
export type EntryType = 'accrual' | 'use' | 'adjustment';

export interface TimeOffEntry {
  id: string;
  kind: TimeOffKind;
  entry_type: EntryType;
  /** Added (positive) or taken (negative). */
  hours: number;
  effective_date: string;
  source_id?: string | null;
  note?: string | null;
}

/** Sick leave earned for hours worked in a pay period. Whole hours are not required: 12 hours worked earns 0.3. */
export function sickAccrual(hoursWorked: number): number {
  return round2(Math.max(0, hoursWorked) / SICK_HOURS_PER_WORKED);
}

/** The first day sick leave can be used: 90 days after the hire date. Null when the hire date is not known. */
export function sickUsableFrom(hireDate: string | null | undefined): string | null {
  if (!hireDate) return null;
  return format(addDays(parseISO(hireDate), SICK_WAITING_DAYS), 'yyyy-MM-dd');
}

export interface Balance {
  /** Hours available on the date. */
  available: number;
  /** Hours earned this calendar year, from work done. */
  earnedThisYear: number;
  /** Hours used this calendar year. */
  usedThisYear: number;
  /** Hours carried in from the year before (after the 40-hour limit). */
  carriedIn: number;
  /** Hours that did not carry over because of the limit, at the start of this year. */
  lostAtYearStart: number;
}

/**
 * The balance on a date for one kind of leave, from the ledger. At each new year the balance carries over up to the cap
 * (40 hours for sick leave), and anything above it is dropped as of January 1. Entries after the date are ignored.
 * Only sick leave is capped; PTO and holiday hours carry whatever the company's own policy says, so they are not capped here.
 */
export function balanceOn(entries: TimeOffEntry[], kind: TimeOffKind, date: string): Balance {
  const mine = entries.filter((e) => e.kind === kind && e.effective_date <= date).sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  const year = Number(date.slice(0, 4));
  const first = mine.length ? Number(mine[0].effective_date.slice(0, 4)) : year;
  const cap = kind === 'sick' ? SICK_CARRYOVER_CAP : Infinity;
  let carry = 0;
  let lost = 0;
  for (let y = first; y <= year; y++) {
    const inYear = mine.filter((e) => e.effective_date.startsWith(`${y}-`));
    const total = round2(carry + inYear.reduce((s, e) => s + e.hours, 0));
    if (y === year) {
      return {
        available: total,
        earnedThisYear: round2(inYear.filter((e) => e.entry_type === 'accrual').reduce((s, e) => s + e.hours, 0)),
        usedThisYear: round2(-inYear.filter((e) => e.entry_type === 'use').reduce((s, e) => s + e.hours, 0)),
        carriedIn: round2(carry),
        lostAtYearStart: round2(lost),
      };
    }
    const kept = Math.min(Math.max(0, total), cap);
    lost = round2(Math.max(0, total) - kept);
    carry = kept;
  }
  return { available: 0, earnedThisYear: 0, usedThisYear: 0, carriedIn: 0, lostAtYearStart: 0 };
}

/** Whether leave of this many hours can be taken on a date: after the waiting period (sick only) and within the balance. */
export function canTake(args: { kind: TimeOffKind; hours: number; date: string; hireDate: string | null | undefined; available: number }): { ok: boolean; reason?: string } {
  if (!(args.hours > 0)) return { ok: false, reason: 'Enter the hours taken.' };
  if (args.kind === 'sick') {
    const from = sickUsableFrom(args.hireDate);
    if (from && args.date < from) return { ok: false, reason: `Sick leave can be used from ${from} (90 days after the hire date).` };
  }
  if (args.hours > args.available + 1e-9) return { ok: false, reason: `Only ${round2(args.available)} hours are available.` };
  return { ok: true };
}

/** What paid leave of some hours costs at an hourly rate. */
export function leavePay(hours: number, hourlyRate: number): number {
  return round2(Math.max(0, hours) * Math.max(0, hourlyRate));
}
