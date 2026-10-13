import { calculateRevenue, roundCents, DEFAULT_POWER_ONLY_PCT, type RevenueSettings } from '@/lib/revenue-calculator';

/**
 * Trues each load up to what Landstar actually settled. A load is entered from the freight bill, which
 * shows amounts before Landstar's cut, so its figures are estimates until the weekly settlement arrives.
 * The Freight Bill Details export lists the settled lines per trip; this module nets them (a revision
 * shows up as a reversal plus a new line), compares them with the stored loads and plans the changes.
 * Nothing is written here: the caller shows the plan and applies only what the owner ticks.
 */

export interface SettlementLine {
  trip: string;
  description: string;
  code: string;
  amount: number;
  delivery: string | null;
  lane: string | null;
  /** The Wednesday Landstar settled the line. */
  settled?: string | null;
  pickup?: string | null;
  agency?: string | null;
  tractor?: string | null;
}

export interface SettledAccessorial {
  key: string;
  label: string;
  amount: number;
}

export interface SettledTrip {
  trip: string;
  /** Your share of linehaul, as Landstar settled it. */
  linehaul: number;
  fsc: number;
  accessorials: SettledAccessorial[];
  total: number;
  /**
   * True when the file holds the whole trip: a linehaul line and no reversal of a line from outside the file.
   * A weekly file, or a revision to a load settled before the file starts, shows only part of a trip.
   */
  hasLinehaul: boolean;
  delivery: string | null;
  lane: string | null;
}

const cents = (v: number) => Math.round(v * 100);
const isFsc = (d: string) => /fuel\s*surcharge/i.test(d);
const isLinehaulName = (d: string) => /tractor\s*l\/h|line\s*haul|linehaul|updtd\s*fb|update\s*detention/i.test(d);

type Bucket = 'linehaul' | 'fsc' | 'accessorial';

function bucketOf(line: SettlementLine): Bucket {
  if (isFsc(line.description)) return 'fsc';
  if (line.code === '1') return 'linehaul';
  if (line.code === '3' || line.code === '2') return 'accessorial';
  // A reversal mirrors the line it replaces.
  return isLinehaulName(line.description) ? 'linehaul' : 'accessorial';
}

/** "STOP OFFS", "Stop-off" and "Stop Off" are the same charge. */
export function accessorialKey(description: string): string {
  const k = description.toLowerCase().replace(/[^a-z]/g, '');
  if (k.startsWith('detention') || k === 'detentionatdestination') return 'detention';
  return k.replace(/s$/, '').replace(/charge$/, '');
}

const LABELS: Record<string, string> = {
  stopoff: 'Stop Off',
  layover: 'Layover',
  detention: 'Detention',
  justintime: 'Just In Time',
  lumper: 'Lumper',
};

export function accessorialLabel(description: string): string {
  const key = accessorialKey(description);
  if (LABELS[key]) return LABELS[key];
  return description.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Nets a trip's settlement lines. A reversal cancels the line of the same amount it replaces. */
export function settleTrips(lines: SettlementLine[]): SettledTrip[] {
  const byTrip = new Map<string, SettlementLine[]>();
  for (const l of lines) {
    if (!l.trip || !['1', '2', '3', 'X'].includes(l.code)) continue;
    (byTrip.get(l.trip) ?? byTrip.set(l.trip, []).get(l.trip)!).push(l);
  }

  const trips: SettledTrip[] = [];
  for (const [trip, group] of byTrip) {
    const positives = group.filter((l) => l.code !== 'X' && l.amount > 0);
    const reversals = group.filter((l) => l.code === 'X' || l.amount < 0);
    const alive = positives.map((p) => ({ line: p, used: false }));
    const loose: SettlementLine[] = [];
    for (const r of reversals) {
      const match = alive.find((p) => !p.used && cents(p.line.amount) === cents(-r.amount));
      if (match) match.used = true;
      else loose.push(r);
    }

    let linehaul = 0;
    let fsc = 0;
    const acc = new Map<string, SettledAccessorial>();
    const add = (line: SettlementLine, amount: number) => {
      const bucket = bucketOf(line);
      if (bucket === 'linehaul') linehaul += amount;
      else if (bucket === 'fsc') fsc += amount;
      else {
        const key = accessorialKey(line.description);
        const prev = acc.get(key);
        acc.set(key, { key, label: prev?.label ?? accessorialLabel(line.description), amount: (prev?.amount ?? 0) + amount });
      }
    };
    for (const p of alive) if (!p.used) add(p.line, p.line.amount);
    for (const r of loose) add(r, r.amount);

    const accessorials = [...acc.values()].map((a) => ({ ...a, amount: roundCents(a.amount) })).filter((a) => Math.abs(a.amount) >= 0.005);
    const withDate = group.find((l) => l.delivery);
    trips.push({
      trip,
      linehaul: roundCents(linehaul),
      fsc: roundCents(fsc),
      accessorials,
      total: roundCents(linehaul + fsc + accessorials.reduce((s, a) => s + a.amount, 0)),
      hasLinehaul: linehaul > 0.005 && loose.length === 0,
      delivery: withDate?.delivery ?? null,
      lane: group.find((l) => l.lane)?.lane ?? null,
    });
  }
  return trips;
}

export interface TrueUpLoad {
  id: string;
  landstar_load_id: string | null;
  status: string | null;
  delivery_date: string | null;
  rate: number | null;
  fuel_surcharge: number | null;
  lumper: number | null;
  advance_taken: number | null;
  is_power_only: boolean | null;
  start_miles: number | null;
  end_miles: number | null;
  net_revenue: number | null;
  accessorials: number | null;
  gross_revenue: number | null;
  truck_revenue: number | null;
  trailer_revenue: number | null;
  settlement: number | null;
  advance_available: number | null;
  actual_miles: number | null;
}

export interface TrueUpAccessorialRow {
  id: string;
  load_id: string;
  accessorial_type: string;
  amount: number | null;
  percentage: number | null;
}

export type AccessorialOp =
  | { kind: 'update'; id: string; type: string; amount: number; percentage: number; was: number }
  | { kind: 'insert'; load_id: string; type: string; amount: number; percentage: number };

export interface TrueUpChange {
  id: string;
  trip: string;
  /** Plain-English lines saying what moves, e.g. "Just In Time $200.00 to $130.00". */
  notes: string[];
  before: number;
  after: number;
  patch: {
    rate: number;
    fuel_surcharge: number;
    gross_revenue: number;
    truck_revenue: number;
    trailer_revenue: number;
    net_revenue: number;
    settlement: number;
    advance_available: number;
    actual_miles: number | null;
    accessorials: number;
  };
  ops: AccessorialOp[];
}

export interface TripRename {
  id: string;
  from: string;
  to: string;
  total: number;
}

export interface TrueUpPlan {
  changes: TrueUpChange[];
  renames: TripRename[];
  unchanged: number;
  /** Settled trips that are not among your loads. */
  missing: SettledTrip[];
  /** Trips whose lines in this file are only a part of the trip, so they were left alone. */
  partial: string[];
  /** Adjustments in the file to loads that are not among yours, usually loads settled before the file starts. */
  adjustments: SettledTrip[];
  /** Delivered loads inside the file's date range that Landstar has not settled. */
  unsettled: { id: string; trip: string; delivery: string | null }[];
  revenueChange: number;
}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function editDistance(a: string, b: string): number {
  if (a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export function planTrueUp(
  trips: SettledTrip[],
  loads: TrueUpLoad[],
  accessorialRows: TrueUpAccessorialRow[],
  settings: RevenueSettings,
): TrueUpPlan {
  const loadByTrip = new Map<string, TrueUpLoad>();
  for (const l of loads) if (l.landstar_load_id) loadByTrip.set(String(l.landstar_load_id), l);
  const rowsByLoad = new Map<string, TrueUpAccessorialRow[]>();
  for (const r of accessorialRows) (rowsByLoad.get(r.load_id) ?? rowsByLoad.set(r.load_id, []).get(r.load_id)!).push(r);
  const settledTrips = new Set(trips.map((t) => t.trip));

  const changes: TrueUpChange[] = [];
  const renames: TripRename[] = [];
  const missing: SettledTrip[] = [];
  const partial: string[] = [];
  const adjustments: SettledTrip[] = [];
  let unchanged = 0;

  const complete = trips.filter((t) => t.hasLinehaul);
  for (const t of trips) {
    if (t.hasLinehaul || Math.abs(t.total) < 0.005) continue;
    if (loadByTrip.has(t.trip)) partial.push(t.trip);
    else adjustments.push(t);
  }

  // A settled trip with no load of that number may be a load saved under a mistyped number.
  const renamedLoadIds = new Set<string>();
  const matched: { trip: SettledTrip; load: TrueUpLoad }[] = [];
  for (const t of complete) {
    const load = loadByTrip.get(t.trip);
    if (load) { matched.push({ trip: t, load }); continue; }
    const lookalike = loads.find(
      (l) =>
        l.landstar_load_id &&
        !settledTrips.has(String(l.landstar_load_id)) &&
        !renamedLoadIds.has(l.id) &&
        Math.abs((l.net_revenue ?? 0) - t.total) < 0.01 &&
        (editDistance(String(l.landstar_load_id), t.trip) <= 3 || (!!t.delivery && l.delivery_date === t.delivery)),
    );
    if (lookalike) {
      renamedLoadIds.add(lookalike.id);
      renames.push({ id: lookalike.id, from: String(lookalike.landstar_load_id), to: t.trip, total: t.total });
    } else {
      missing.push(t);
    }
  }

  for (const { trip: t, load } of matched) {
    const pct = load.is_power_only ? settings.powerOnlyPct ?? DEFAULT_POWER_ONLY_PCT : settings.truckPct;
    if (!pct) continue;
    // Keep the stored rate when it already gives Landstar's linehaul share to the cent.
    const rate = Math.abs((load.rate ?? 0) * pct - t.linehaul) < 0.0051 ? load.rate ?? 0 : roundCents(t.linehaul / pct);
    const accTotal = roundCents(t.accessorials.reduce((s, a) => s + a.amount, 0));

    const result = calculateRevenue(
      {
        rate,
        fuel_surcharge: t.fsc,
        lumper: load.lumper || 0,
        advance_taken: load.advance_taken || 0,
        is_power_only: load.is_power_only || false,
        start_miles: load.start_miles,
        end_miles: load.end_miles,
        accessorialsTotal: accTotal,
      },
      settings,
    );

    // Accessorial rows. Settled charges are matched to stored rows first by name, then by dollars (a charge
    // saved as "Other" is the same charge when the amount agrees). What is left over is added or zeroed.
    const existing = rowsByLoad.get(load.id) ?? [];
    const shareOf = (r: TrueUpAccessorialRow) => (r.amount || 0) * ((r.percentage ?? 100) / 100);
    const ops: AccessorialOp[] = [];
    const notes: string[] = [];
    let freeRows = [...existing];
    const unmatched: SettledAccessorial[] = [];
    for (const a of t.accessorials) {
      const rows = freeRows.filter((r) => accessorialKey(r.accessorial_type) === a.key);
      if (rows.length === 0) { unmatched.push(a); continue; }
      freeRows = freeRows.filter((r) => !rows.includes(r));
      const stored = rows.reduce((sum, r) => sum + shareOf(r), 0);
      if (Math.abs(stored - a.amount) < 0.01) continue;
      const [first, ...rest] = rows;
      ops.push({ kind: 'update', id: first.id, type: first.accessorial_type, amount: a.amount, percentage: 100, was: first.amount || 0 });
      for (const r of rest) if ((r.amount || 0) !== 0) ops.push({ kind: 'update', id: r.id, type: r.accessorial_type, amount: 0, percentage: r.percentage ?? 100, was: r.amount || 0 });
      notes.push(`${first.accessorial_type} ${money(stored)} to ${money(a.amount)}`);
    }
    for (const a of unmatched) {
      const same = freeRows.find((r) => Math.abs(shareOf(r) - a.amount) < 0.01);
      if (same) { freeRows = freeRows.filter((r) => r !== same); continue; }
      ops.push({ kind: 'insert', load_id: load.id, type: a.label, amount: a.amount, percentage: 100 });
      notes.push(`${a.label} ${money(a.amount)} added`);
    }
    for (const r of freeRows) {
      if ((r.amount || 0) === 0) continue;
      ops.push({ kind: 'update', id: r.id, type: r.accessorial_type, amount: 0, percentage: r.percentage ?? 100, was: r.amount || 0 });
      notes.push(`${r.accessorial_type} ${money(shareOf(r))} removed (Landstar did not pay it)`);
    }

    if (Math.abs((load.rate ?? 0) - rate) >= 0.01) notes.unshift(`Rate ${money(load.rate ?? 0)} to ${money(rate)}`);
    if (Math.abs((load.fuel_surcharge ?? 0) - t.fsc) >= 0.01) notes.unshift(`Fuel surcharge ${money(load.fuel_surcharge ?? 0)} to ${money(t.fsc)}`);

    const moved =
      Math.abs((load.rate ?? 0) - rate) >= 0.01 ||
      Math.abs((load.fuel_surcharge ?? 0) - t.fsc) >= 0.01 ||
      Math.abs((load.net_revenue ?? 0) - result.net_revenue) >= 0.015 ||
      ops.length > 0;
    if (!moved) { unchanged++; continue; }

    changes.push({
      id: load.id,
      trip: t.trip,
      notes,
      before: roundCents(load.net_revenue ?? 0),
      after: result.net_revenue,
      patch: {
        rate,
        fuel_surcharge: t.fsc,
        gross_revenue: result.gross_revenue,
        truck_revenue: result.truck_revenue,
        trailer_revenue: result.trailer_revenue,
        net_revenue: result.net_revenue,
        settlement: result.settlement,
        advance_available: result.advance_available,
        actual_miles: result.actual_miles,
        accessorials: result.accessorials,
      },
      ops,
    });
  }

  // Delivered loads that fall inside the dates Landstar's file covers but are not in it.
  const dates = trips.map((t) => t.delivery).filter((d): d is string => !!d).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const unsettled = first
    ? loads
        .filter(
          (l) =>
            l.status === 'delivered' &&
            l.landstar_load_id &&
            l.delivery_date &&
            l.delivery_date >= first &&
            l.delivery_date <= last &&
            !settledTrips.has(String(l.landstar_load_id)) &&
            !renamedLoadIds.has(l.id),
        )
        .map((l) => ({ id: l.id, trip: String(l.landstar_load_id), delivery: l.delivery_date }))
    : [];

  return {
    changes,
    renames,
    unchanged,
    missing,
    partial,
    adjustments,
    unsettled,
    revenueChange: roundCents(changes.reduce((s, c) => s + (c.after - c.before), 0)),
  };
}
