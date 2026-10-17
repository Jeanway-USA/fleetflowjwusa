import { classifyStatementLine } from '@/lib/expense-classifier';
import { isAdvanceExpense } from '@/lib/expense-types';
import { calculateRevenue, roundCents, type RevenueSettings } from '@/lib/revenue-calculator';
import { settleTrips, type SettledTrip, type SettlementLine } from '@/lib/settlement-trueup';

/**
 * Proves the app against Landstar's own Freight Bill Details export, trip by trip and week by week.
 * For every trip Landstar settled, three amounts must agree with what the app holds:
 *   revenue   what Landstar paid you on the trip vs the revenue on the load,
 *   charges   card fees, trip scanning and taxes Landstar took vs the expenses linked to the load,
 *   advances  pre-trip and partial-final advances Landstar loaded vs the advances linked to the load.
 * A week is "proven" when every trip first settled in it agrees to the cent.
 */

export interface ProofLoad {
  id: string;
  landstar_load_id: string | null;
  net_revenue: number | null;
}

export interface ProofExpense {
  id?: string;
  expense_date?: string | null;
  load_id: string | null;
  expense_type: string;
  amount: number | string | null;
  description?: string | null;
  notes?: string | null;
}

/** Money the fuel card spends and credits that come back are not Landstar charges on a trip. */
const NOT_TRIP_CHARGE_TYPES = new Set(['Fuel', 'DEF', 'Fuel Discount', 'Reimbursement', 'Direct Deposit', 'Cash Advance']);

/** Lines on one side with no partner on the other: the exact amounts that make a trip disagree. */
export interface LineGap {
  /** Your lines that Landstar has no matching line for: suspected duplicates or wrong links. */
  surplus: Array<{ id?: string; date: string | null; description: string; amount: number }>;
  /** Landstar lines that none of your lines match: not imported. */
  missing: Array<{ description: string; amount: number }>;
}

export type ProofIssue = 'missing_load' | 'revenue' | 'charges' | 'advances';

export interface TripProof {
  trip: string;
  /** The Wednesday of the trip's first settlement line. */
  week: string | null;
  loadFound: boolean;
  /** Settled with charges and advances only, no revenue: recorded as expenses, not as a load. */
  advanceOnly: boolean;
  /** The file shows only part of this trip (reversal lines), so its charges and advances are not compared. */
  partial: boolean;
  loadId: string | null;
  /** The trip's pickup date from the file; statement lines are dated by it. */
  pickup: string | null;
  /** Everything the file says about the trip, enough to add it as a load. */
  meta: { delivery: string | null; lane: string | null; agency: string | null; tractor: string | null };
  settledTrip: SettledTrip | null;
  landstar: { revenue: number; charges: number; advances: number };
  app: { revenue: number; charges: number; advances: number };
  /** Revenue is only compared when the file holds the whole trip. */
  revenueComparable: boolean;
  gaps: { charges: LineGap; advances: LineGap };
  issues: ProofIssue[];
}

export interface WeekProof {
  week: string;
  trips: number;
  landstar: { revenue: number; charges: number; advances: number };
  app: { revenue: number; charges: number; advances: number };
  /** Trips in the week that do not agree. */
  open: TripProof[];
  proven: boolean;
}

export interface ProofResult {
  trips: TripProof[];
  weeks: WeekProof[];
  provenTrips: number;
  openTrips: number;
}

const cents = (v: number) => Math.round(v * 100);

/** Code V lines are advances taken; a code 8 pre-trip line (UA, VOID) is Landstar paying one back. */
const isAdvanceLine = (l: SettlementLine) => l.code === 'V' || (l.code === '8' && /pre-trip|advance|partial\s*final/i.test(l.description));

/** The note that ties an expense to an advance-only Landstar trip. */
export const advanceOnlyNote = (trip: string) => `Landstar trip ${trip} (advance only, no load)`;
export const advanceOnlyTrip = (notes: string | null | undefined): string | null => notes?.match(/^Landstar trip (\d+) \(advance only/)?.[1] ?? null;

/** The expense row for a Landstar line the app is missing. */
export function expenseForMissingLine(
  line: { description: string; amount: number },
  kind: 'charge' | 'advance',
): { expense_type: string; description: string; amount: number } {
  const description = line.description.trim();
  if (kind === 'advance') return { expense_type: 'Advance', description, amount: line.amount };
  const verdict = classifyStatementLine(description);
  let expense_type = 'Misc';
  if (verdict?.action === 'retype') expense_type = verdict.toType;
  else if (/card\s*fee/i.test(description)) expense_type = 'Card Fee';
  else if (/trkstp\s*scn|scanning/i.test(description)) expense_type = 'Trip Scanning';
  return { expense_type, description, amount: line.amount };
}

/** Pairs equal amounts one to one; whatever is left on each side is the gap. */
function pairLines(
  landstar: Array<{ description: string; amount: number }>,
  app: Array<{ id?: string; date: string | null; description: string; amount: number }>,
): LineGap {
  const free = [...app];
  const missing: LineGap['missing'] = [];
  for (const l of landstar) {
    const i = free.findIndex((a) => cents(a.amount) === cents(l.amount));
    if (i >= 0) free.splice(i, 1);
    else missing.push(l);
  }
  return { surplus: free, missing };
}

export function proveTrips(lines: SettlementLine[], loads: ProofLoad[], expenses: ProofExpense[]): ProofResult {
  const loadByTrip = new Map<string, ProofLoad>();
  for (const l of loads) if (l.landstar_load_id) loadByTrip.set(String(l.landstar_load_id), l);
  const expensesByLoad = new Map<string, ProofExpense[]>();
  for (const e of expenses) if (e.load_id) (expensesByLoad.get(e.load_id) ?? expensesByLoad.set(e.load_id, []).get(e.load_id)!).push(e);

  const settled = new Map(settleTrips(lines).map((t) => [t.trip, t]));
  const byTrip = new Map<string, SettlementLine[]>();
  for (const l of lines) (byTrip.get(l.trip) ?? byTrip.set(l.trip, []).get(l.trip)!).push(l);

  const trips: TripProof[] = [];
  for (const [trip, group] of byTrip) {
    // Card fees of a trip with no load sit among the card's other unlinked fees, so the year-to-date ledger checks them.
    const hasRevenue = settled.has(trip);
    const chargeLines = group.filter((l) => l.code === 'B' && (hasRevenue || loadByTrip.has(trip) || !/^card\s*fee$/i.test(l.description.trim()))).map((l) => ({ description: l.description, amount: roundCents(Math.abs(l.amount)) }));
    // Landstar prints an advance taken as negative and one paid back as positive; the app counts taken as positive.
    const advanceLines = group.filter(isAdvanceLine).map((l) => ({ description: l.description, amount: roundCents(-l.amount) }));
    const charges = roundCents(chargeLines.reduce((s, l) => s + l.amount, 0));
    const advances = roundCents(advanceLines.reduce((s, l) => s + l.amount, 0));
    const revenueLines = settled.get(trip);
    const revenue = revenueLines?.total ?? 0;
    const revenueComparable = !!revenueLines?.hasLinehaul;
    const dates = group.map((l) => l.settled).filter((d): d is string => !!d).sort();
    const load = loadByTrip.get(trip);
    // A trip Landstar settled only with charges and advances (no revenue at all) is not a load. Its lines are
    // recorded on their own, tagged with the trip number in their notes.
    const advanceOnly = !load && !revenueLines;

    const linked = load ? expensesByLoad.get(load.id) ?? [] : advanceOnly ? expenses.filter((e) => !e.load_id && advanceOnlyTrip(e.notes) === trip) : [];
    const toLine = (e: ProofExpense) => ({ id: e.id, date: e.expense_date ?? null, description: e.description || e.expense_type, amount: roundCents(Math.abs(Number(e.amount) || 0)) });
    // An advance paid back is saved as a negative amount, so its sign is kept.
    const appAdvanceLines = linked.filter((e) => isAdvanceExpense(e as never)).map((e) => ({ ...toLine(e), amount: roundCents(Number(e.amount) || 0) }));
    const appChargeLines = linked.filter((e) => !isAdvanceExpense(e as never) && !NOT_TRIP_CHARGE_TYPES.has(e.expense_type) && (Number(e.amount) || 0) > 0).map(toLine);
    const appAdvances = roundCents(appAdvanceLines.reduce((s, l) => s + l.amount, 0));
    const appCharges = roundCents(appChargeLines.reduce((s, l) => s + l.amount, 0));
    const appRevenue = roundCents(Number(load?.net_revenue) || 0);

    // The weekly file can show only the tail of a trip Landstar reversed and reissued (reversal lines, and nothing
    // else to compare). Its charges and advances are then spread over other weeks, so they cannot be proven here.
    const partial = !advanceOnly && group.some((l) => l.code === 'X') && !group.some((l) => l.code === 'B' || isAdvanceLine(l));

    const issues: ProofIssue[] = [];
    if (!load && !advanceOnly) issues.push('missing_load');
    else {
      if (!advanceOnly && revenueComparable && cents(appRevenue) !== cents(revenue)) issues.push('revenue');
      if (!partial && cents(appCharges) !== cents(charges)) issues.push('charges');
      if (!partial && cents(appAdvances) !== cents(advances)) issues.push('advances');
    }

    trips.push({
      trip,
      week: dates[0] ?? null,
      loadFound: !!load,
      advanceOnly,
      partial,
      loadId: load?.id ?? null,
      pickup: group.map((l) => l.pickup).find((d): d is string => !!d) ?? null,
      meta: {
        delivery: group.map((l) => l.delivery).find((d): d is string => !!d) ?? null,
        lane: group.map((l) => l.lane).find((d): d is string => !!d) ?? null,
        agency: group.map((l) => l.agency).find((d): d is string => !!d) ?? null,
        tractor: group.map((l) => l.tractor).find((d): d is string => !!d) ?? null,
      },
      settledTrip: revenueLines ?? null,
      landstar: { revenue, charges, advances },
      app: { revenue: appRevenue, charges: appCharges, advances: appAdvances },
      revenueComparable,
      gaps: { charges: pairLines(chargeLines, appChargeLines), advances: pairLines(advanceLines, appAdvanceLines) },
      issues,
    });
  }

  const weeks = new Map<string, TripProof[]>();
  for (const t of trips) {
    const key = t.week ?? 'undated';
    (weeks.get(key) ?? weeks.set(key, []).get(key)!).push(t);
  }
  const weekRows: WeekProof[] = [...weeks.entries()]
    .map(([week, list]) => {
      const sum = (pick: (t: TripProof) => number) => roundCents(list.reduce((s, t) => s + pick(t), 0));
      const open = list.filter((t) => t.issues.length > 0);
      return {
        week,
        trips: list.length,
        landstar: { revenue: sum((t) => (t.revenueComparable ? t.landstar.revenue : 0)), charges: sum((t) => t.landstar.charges), advances: sum((t) => t.landstar.advances) },
        app: { revenue: sum((t) => (t.revenueComparable ? t.app.revenue : 0)), charges: sum((t) => t.app.charges), advances: sum((t) => t.app.advances) },
        open,
        proven: open.length === 0,
      };
    })
    .sort((a, b) => b.week.localeCompare(a.week));

  return {
    trips,
    weeks: weekRows,
    provenTrips: trips.filter((t) => t.issues.length === 0).length,
    openTrips: trips.filter((t) => t.issues.length > 0).length,
  };
}

const SMALL_CASE = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** "ORLANDO, FL" or "EDISON         ,MI" to "Orlando, FL". */
function place(raw: string): string {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return raw.trim();
  const state = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
  const city = parts.slice(0, parts.length > 1 ? -1 : undefined).join(', ').split(/\s+/).map(SMALL_CASE).join(' ');
  return state ? `${city}, ${state}` : city;
}

/** Landstar's lane text, "ORLANDO, FL - READING, PA", as an origin and a destination. */
export function lanePlaces(lane: string | null | undefined): { origin: string; destination: string } | null {
  const [from, to] = String(lane ?? '').split(/\s+-\s+/);
  return from && to ? { origin: place(from), destination: place(to) } : null;
}

/**
 * A load built from what Landstar settled for a trip the app does not have: its dates, lane and agency from the
 * file, and its money from the settled lines (your share of linehaul, fuel surcharge, accessorials). Only trips
 * whose whole revenue is in the file qualify.
 */
export function loadForMissingTrip(
  t: TripProof,
  settings: RevenueSettings,
  truckByUnit: Map<string, string>,
): { load: Record<string, unknown>; accessorials: Array<{ accessorial_type: string; amount: number; percentage: number }> } | null {
  const settled = t.settledTrip;
  const places = lanePlaces(t.meta.lane);
  if (t.loadFound || !settled?.hasLinehaul || !places || !settings.truckPct) return null;

  const accessorials = settled.accessorials.map((a) => ({ accessorial_type: a.label, amount: a.amount, percentage: 100 }));
  const rate = roundCents(settled.linehaul / settings.truckPct);
  const result = calculateRevenue(
    { rate, fuel_surcharge: settled.fsc, lumper: 0, advance_taken: 0, is_power_only: false, accessorialsTotal: roundCents(settled.accessorials.reduce((s, a) => s + a.amount, 0)) },
    settings,
  );
  return {
    load: {
      landstar_load_id: t.trip,
      origin: places.origin,
      destination: places.destination,
      pickup_date: t.pickup,
      delivery_date: t.meta.delivery,
      status: t.meta.delivery ? 'delivered' : 'assigned',
      agency_code: t.meta.agency ? t.meta.agency.split(/\s+-\s+/)[0].trim() : null,
      truck_id: t.meta.tractor ? truckByUnit.get(t.meta.tractor) ?? null : null,
      rate,
      fuel_surcharge: settled.fsc,
      accessorials: result.accessorials,
      gross_revenue: result.gross_revenue,
      truck_revenue: result.truck_revenue,
      trailer_revenue: result.trailer_revenue,
      net_revenue: result.net_revenue,
      settlement: result.settlement,
      advance_available: result.advance_available,
      notes: "Added from Landstar's Freight Bill Details. Check the driver and trailer.",
    },
    accessorials,
  };
}
