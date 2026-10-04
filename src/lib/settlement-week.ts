import { addDays, addWeeks, format, startOfWeek } from 'date-fns';

/**
 * Landstar settles BCOs weekly; each period ends on a Wednesday, so the week
 * runs Thursday through Wednesday. date-fns weekday index: 4 = Thursday.
 */
export const SETTLEMENT_WEEK_START = 4 as const;

export interface SettlementWeek {
  start: Date; // Thursday 00:00 local
  end: Date; // Wednesday (period-ending day) 00:00 local
  days: Date[]; // 7 days, Thursday first
  /** YYYY-MM-DD of each day, for comparing against date columns. */
  isoDays: string[];
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function settlementWeek(reference: Date, offsetWeeks = 0): SettlementWeek {
  const start = startOfWeek(addWeeks(reference, offsetWeeks), { weekStartsOn: SETTLEMENT_WEEK_START });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days, isoDays: days.map(iso) };
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
