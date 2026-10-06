import { classifyStatementLine } from '@/lib/expense-classifier';
import { isAdvanceExpense } from '@/lib/expense-types';
import { roundCents } from '@/lib/revenue-calculator';
import { settleTrips, type SettlementLine } from '@/lib/settlement-trueup';

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
  loadId: string | null;
  /** The trip's pickup date from the file; statement lines are dated by it. */
  pickup: string | null;
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
    const chargeLines = group.filter((l) => l.code === 'B').map((l) => ({ description: l.description, amount: roundCents(Math.abs(l.amount)) }));
    const advanceLines = group.filter((l) => l.code === 'V').map((l) => ({ description: l.description, amount: roundCents(Math.abs(l.amount)) }));
    const charges = roundCents(chargeLines.reduce((s, l) => s + l.amount, 0));
    const advances = roundCents(advanceLines.reduce((s, l) => s + l.amount, 0));
    const revenueLines = settled.get(trip);
    const revenue = revenueLines?.total ?? 0;
    const revenueComparable = !!revenueLines?.hasLinehaul;
    const dates = group.map((l) => l.settled).filter((d): d is string => !!d).sort();
    const load = loadByTrip.get(trip);

    const linked = load ? expensesByLoad.get(load.id) ?? [] : [];
    const toLine = (e: ProofExpense) => ({ id: e.id, date: e.expense_date ?? null, description: e.description || e.expense_type, amount: roundCents(Math.abs(Number(e.amount) || 0)) });
    const appAdvanceLines = linked.filter((e) => isAdvanceExpense(e as never)).map(toLine);
    const appChargeLines = linked.filter((e) => !isAdvanceExpense(e as never) && !NOT_TRIP_CHARGE_TYPES.has(e.expense_type) && (Number(e.amount) || 0) > 0).map(toLine);
    const appAdvances = roundCents(appAdvanceLines.reduce((s, l) => s + l.amount, 0));
    const appCharges = roundCents(appChargeLines.reduce((s, l) => s + l.amount, 0));
    const appRevenue = roundCents(Number(load?.net_revenue) || 0);

    const issues: ProofIssue[] = [];
    if (!load) issues.push('missing_load');
    else {
      if (revenueComparable && cents(appRevenue) !== cents(revenue)) issues.push('revenue');
      if (cents(appCharges) !== cents(charges)) issues.push('charges');
      if (cents(appAdvances) !== cents(advances)) issues.push('advances');
    }

    trips.push({
      trip,
      week: dates[0] ?? null,
      loadFound: !!load,
      loadId: load?.id ?? null,
      pickup: group.map((l) => l.pickup).find((d): d is string => !!d) ?? null,
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
