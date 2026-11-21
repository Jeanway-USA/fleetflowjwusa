import { addDays, addWeeks, format, startOfWeek } from 'date-fns';

/**
 * The settlement (work) week is seven days, chosen by the day it ENDS on. Weekdays use the date-fns index: 0 = Sunday ... 6 = Saturday.
 *
 * Landstar settles BCOs weekly and each period ends on a Wednesday, so the week runs Thursday through Wednesday. That is the
 * default everywhere a company has not chosen another end day (Settings, Company: "Settlement week ends on").
 */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Landstar's settlement week ends on a Wednesday... */
export const LANDSTAR_WEEK_END_DAY: WeekDay = 3;
/** ...so it starts on a Thursday. */
export const LANDSTAR_WEEK_STARTS_ON: WeekDay = 4;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayName = (day: number): string => WEEKDAY_NAMES[((Math.round(day) % 7) + 7) % 7];

/** The day a week starts on, given the day it ends on. A week ending Wednesday starts Thursday. */
export const weekStartsOnFor = (endDay: WeekDay): WeekDay => (((endDay + 1) % 7) as WeekDay);
/** The day a week ends on, given the day it starts on. */
export const weekEndDayFor = (startsOn: WeekDay): WeekDay => (((startsOn + 6) % 7) as WeekDay);

/** A saved setting as a weekday, or the Landstar default when it is missing or not 0 to 6. */
export function toWeekDay(value: unknown, fallback: WeekDay = LANDSTAR_WEEK_END_DAY): WeekDay {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6 ? (n as WeekDay) : fallback;
}

export interface SettlementWeek {
  start: Date; // first day of the week, 00:00 local
  end: Date; // last day of the week (the period-ending day), 00:00 local
  days: Date[]; // 7 days, the first day first
  /** YYYY-MM-DD of each day, for comparing against date columns. */
  isoDays: string[];
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** The week that holds `reference` (moved by `offsetWeeks`), starting on `weekStartsOn`. Default: Landstar's Thursday start. */
export function settlementWeek(reference: Date, offsetWeeks = 0, weekStartsOn: WeekDay = LANDSTAR_WEEK_STARTS_ON): SettlementWeek {
  const start = startOfWeek(addWeeks(reference, offsetWeeks), { weekStartsOn });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days, isoDays: days.map(iso) };
}

/** The period-ending day on or after `date`: the day the week holding it ends. */
export function periodEndOnOrAfter(date: Date, endDay: WeekDay = LANDSTAR_WEEK_END_DAY): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, (endDay - d.getDay() + 7) % 7);
}

/** The most recent period-ending day on or before `date`. */
export function latestPeriodEnd(date: Date, endDay: WeekDay = LANDSTAR_WEEK_END_DAY): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, -((d.getDay() - endDay + 7) % 7));
}

export interface LogbookLoadInput {
  id: string;
  pickup_date: string | null;
  delivery_date: string | null;
  status: string | null;
}

export interface LogbookSegment<T extends LogbookLoadInput> {
  load: T;
  /** First and last day column the segment covers, 0-6. */
  fromCol: number;
  toCol: number;
  /** The load started before / runs past this week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Place loads on the week's 7 day columns, the way a duty-status line runs
 * across a log page: from pickup day to delivery day, clipped to the week.
 * Loads with no pickup date are skipped; a missing delivery date is treated as
 * a one-day load on the pickup day. Sorted by pickup, then delivery.
 */
export function layoutLogbook<T extends LogbookLoadInput>(loads: T[], week: SettlementWeek): LogbookSegment<T>[] {
  const first = week.isoDays[0];
  const last = week.isoDays[6];
  const colOf = (d: string) => week.isoDays.indexOf(d);

  return loads
    .filter((l) => !!l.pickup_date)
    .map((load) => {
      const pickup = load.pickup_date!;
      const delivery = load.delivery_date && load.delivery_date >= pickup ? load.delivery_date : pickup;
      return { load, pickup, delivery };
    })
    .filter(({ pickup, delivery }) => pickup <= last && delivery >= first)
    .sort((a, b) => a.pickup.localeCompare(b.pickup) || a.delivery.localeCompare(b.delivery))
    .map(({ load, pickup, delivery }) => ({
      load,
      fromCol: pickup < first ? 0 : colOf(pickup),
      toCol: delivery > last ? 6 : colOf(delivery),
      continuesBefore: pickup < first,
      continuesAfter: delivery > last,
    }));
}

export type LogbookState = 'planned' | 'moving' | 'delivered' | 'cancelled';

/** Collapse the app's load statuses into the logbook's four state marks. */
export function logbookState(status: string | null): LogbookState {
  switch (status) {
    case 'delivered':
    case 'invoiced':
    case 'paid':
      return 'delivered';
    case 'loading':
    case 'at_pickup':
    case 'in_transit':
    case 'at_delivery':
    case 'unloading':
      return 'moving';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'planned';
  }
}
