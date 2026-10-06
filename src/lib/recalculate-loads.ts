import { calculateRevenue, roundCents, type RevenueSettings } from '@/lib/revenue-calculator';

/**
 * Works out what "recalculate loads" would change before anything is written. Each load's stored
 * revenue figures are compared with what the current rates would produce, and only loads that
 * differ by a cent or more are listed, so a recalculation that changes nothing says so and writes
 * nothing.
 */

export interface RecalcLoad {
  id: string;
  landstar_load_id: string | null;
  rate: number | null;
  fuel_surcharge: number | null;
  lumper: number | null;
  advance_taken: number | null;
  is_power_only: boolean | null;
  start_miles: number | null;
  end_miles: number | null;
  gross_revenue: number | null;
  truck_revenue: number | null;
  trailer_revenue: number | null;
  net_revenue: number | null;
  settlement: number | null;
  advance_available: number | null;
  actual_miles: number | null;
  accessorials: number | null;
}

export interface RecalcAccessorial {
  load_id: string;
  amount: number | null;
  /** Share of the accessorial you receive, 0 to 100. */
  percentage: number | null;
}

export interface RecalcPatch {
  gross_revenue: number;
  truck_revenue: number;
  trailer_revenue: number;
  net_revenue: number;
  settlement: number;
  advance_available: number;
  actual_miles: number | null;
  accessorials: number;
}

export interface RecalcChange {
  id: string;
  trip: string;
  /** Your revenue on the load before and after. */
  before: number;
  after: number;
  patch: RecalcPatch;
}

export interface RecalcPlan {
  total: number;
  changes: RecalcChange[];
  unchanged: number;
  /** Total change in your revenue if every listed load is updated. */
  revenueChange: number;
}

const differs = (stored: number | null, next: number) => Math.abs((stored ?? 0) - next) >= 0.01;

export function planRecalculation(loads: RecalcLoad[], accessorials: RecalcAccessorial[], settings: RevenueSettings): RecalcPlan {
  const accessorialsByLoad = new Map<string, number>();
  for (const a of accessorials) {
    accessorialsByLoad.set(a.load_id, (accessorialsByLoad.get(a.load_id) ?? 0) + (a.amount || 0) * ((a.percentage || 0) / 100));
  }

  const changes: RecalcChange[] = [];
  for (const load of loads) {
    const result = calculateRevenue(
      {
        rate: load.rate || 0,
        fuel_surcharge: load.fuel_surcharge || 0,
        lumper: load.lumper || 0,
        advance_taken: load.advance_taken || 0,
        is_power_only: load.is_power_only || false,
        start_miles: load.start_miles,
        end_miles: load.end_miles,
        accessorialsTotal: accessorialsByLoad.get(load.id) ?? 0,
      },
      settings,
    );

    const changed =
      differs(load.gross_revenue, result.gross_revenue) ||
      differs(load.truck_revenue, result.truck_revenue) ||
      differs(load.trailer_revenue, result.trailer_revenue) ||
      differs(load.net_revenue, result.net_revenue) ||
      differs(load.settlement, result.settlement) ||
      differs(load.advance_available, result.advance_available) ||
      differs(load.accessorials, result.accessorials) ||
      (result.actual_miles ?? null) !== (load.actual_miles ?? null);
    if (!changed) continue;

    changes.push({
      id: load.id,
      trip: load.landstar_load_id ?? '',
      before: roundCents(load.net_revenue ?? 0),
      after: result.net_revenue,
      patch: {
        gross_revenue: result.gross_revenue,
        truck_revenue: result.truck_revenue,
        trailer_revenue: result.trailer_revenue,
        net_revenue: result.net_revenue,
        settlement: result.settlement,
        advance_available: result.advance_available,
        actual_miles: result.actual_miles,
        accessorials: result.accessorials,
      },
    });
  }

  return {
    total: loads.length,
    changes,
    unchanged: loads.length - changes.length,
    revenueChange: roundCents(changes.reduce((sum, c) => sum + (c.after - c.before), 0)),
  };
}
