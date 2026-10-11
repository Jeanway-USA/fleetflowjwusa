import { addDays, format, parseISO } from 'date-fns';
import { truckRevenueOf } from '@/lib/pl-metrics';

/**
 * The numbers Landstar's own BCO Analytics shows, worked out from your delivered loads:
 * what customers were billed in all (the all-in gross), what Landstar kept, what you earned (your 1099 revenue),
 * and how that splits into linehaul, fuel surcharge and accessorials, by week, month and quarter, against last year.
 */

export interface OverviewLoad {
  delivery_date: string | null;
  gross_revenue?: number | string | null;
  net_revenue?: number | string | null;
  truck_revenue?: number | string | null;
  fuel_surcharge?: number | string | null;
  accessorials?: number | string | null;
  booked_miles?: number | string | null;
  actual_miles?: number | string | null;
  truck_id?: string | null;
}

export interface OverviewTotals {
  shipments: number;
  /** What customers were billed in all: linehaul, fuel surcharge and accessorials, before Landstar's cut. */
  gross: number;
  /** Your 1099 revenue: your share after Landstar's cut. */
  yours: number;
  landstarCut: number;
  /** Your share of linehaul (your revenue less fuel surcharge and accessorials). */
  linehaul: number;
  fuelSurcharge: number;
  accessorials: number;
  billedMiles: number;
  tractors: number;
  /** Gross billed per billed mile: the all-in rate. */
  allInRate: number;
  /** Your revenue per billed mile. */
  netRate: number;
}

const n = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function summarize(loads: OverviewLoad[]): OverviewTotals {
  let gross = 0;
  let yours = 0;
  let fuelSurcharge = 0;
  let accessorials = 0;
  let billedMiles = 0;
  const tractors = new Set<string>();
  for (const l of loads) {
    const mine = truckRevenueOf(l);
    yours += mine;
    // A load never given a gross figure counts what you were paid, so the all-in rate is never below it.
    gross += Math.max(n(l.gross_revenue), mine);
    fuelSurcharge += n(l.fuel_surcharge);
    accessorials += n(l.accessorials);
    billedMiles += n(l.booked_miles) || n(l.actual_miles);
    if (l.truck_id) tractors.add(l.truck_id);
  }
  return {
    shipments: loads.length,
    gross: round2(gross),
    yours: round2(yours),
    landstarCut: round2(gross - yours),
    linehaul: round2(yours - fuelSurcharge - accessorials),
    fuelSurcharge: round2(fuelSurcharge),
    accessorials: round2(accessorials),
    billedMiles: Math.round(billedMiles),
    tractors: tractors.size,
    allInRate: billedMiles > 0 ? round2(gross / billedMiles) : 0,
    netRate: billedMiles > 0 ? round2(yours / billedMiles) : 0,
  };
}

export type OverviewPeriod = 'week' | 'month' | 'quarter';

/** Landstar settles Thursday to Wednesday; a load belongs to the Wednesday that ends its week. */
function settlementWednesday(date: string): string {
  const d = parseISO(date);
  const behind = (d.getDay() - 3 + 7) % 7; // days since Wednesday
  return format(behind === 0 ? d : addDays(d, 7 - behind), 'yyyy-MM-dd');
}

export function periodKey(date: string, period: OverviewPeriod): string {
  if (period === 'week') return settlementWednesday(date);
  if (period === 'month') return date.slice(0, 7);
  return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
}

export function periodLabel(key: string, period: OverviewPeriod): string {
  if (period === 'week') return `Week ending ${format(parseISO(key), 'MMM d')}`;
  if (period === 'month') return format(parseISO(`${key}-01`), 'MMMM');
  return key.replace('-', ' ');
}

export interface PeriodRow extends OverviewTotals {
  key: string;
}

export function bySeries(loads: OverviewLoad[], period: OverviewPeriod): PeriodRow[] {
  const groups = new Map<string, OverviewLoad[]>();
  for (const l of loads) {
    if (!l.delivery_date) continue;
    const key = periodKey(l.delivery_date, period);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, ...summarize(list) }));
}

export interface Comparison {
  current: number;
  previous: number;
  change: number;
  /** Null when there was nothing last year to compare with. */
  percent: number | null;
}

export function compare(current: number, previous: number): Comparison {
  return { current, previous, change: round2(current - previous), percent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

/**
 * This year to date against the same stretch of last year (January 1 up to the same month and day). For a
 * finished year it is the whole year against the whole year before.
 */
export function yearToDatePair(loads: OverviewLoad[], year: number, asOf: Date) {
  const finished = year < asOf.getFullYear();
  const monthDay = format(asOf, 'MM-dd');
  const pick = (y: number) =>
    loads.filter((l) => l.delivery_date && l.delivery_date >= `${y}-01-01` && l.delivery_date <= (finished ? `${y}-12-31` : `${y}-${monthDay}`));
  return { current: summarize(pick(year)), previous: summarize(pick(year - 1)) };
}
