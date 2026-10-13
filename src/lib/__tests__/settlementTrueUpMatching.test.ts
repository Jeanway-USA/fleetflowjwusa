import { describe, expect, it } from 'vitest';
import { settleTrips, planTrueUp, type SettlementLine, type TrueUpLoad, type TrueUpAccessorialRow } from '@/lib/settlement-trueup';

const line = (trip: string, description: string, code: string, amount: number): SettlementLine => ({ trip, description, code, amount, delivery: null, lane: null });
const settings = { truckPct: 0.65, trailerPct: 0.07, advancePct: 0.3, ownsTrailer: false, powerOnlyPct: 0.7 };
const load = (over: Partial<TrueUpLoad>): TrueUpLoad => ({
  id: 'L', landstar_load_id: '1', status: 'delivered', delivery_date: null, rate: 1000, fuel_surcharge: 100, lumper: 0, advance_taken: 0,
  is_power_only: false, start_miles: null, end_miles: null, net_revenue: 1000, accessorials: 250, gross_revenue: 1350, truck_revenue: 1000,
  trailer_revenue: 0, settlement: 1000, advance_available: 0, actual_miles: null, ...over,
});

describe('settled accessorials', () => {
  it('counts Percent Over Contract (code 2) as an accessorial', () => {
    const [t] = settleTrips([line('1', 'TRACTOR L/H', '1', 650), line('1', 'PERCENT OVER CONTRACT', '2', 35.14), line('1', 'FUEL SURCHARGE', '3', 100)]);
    expect(t.total).toBe(785.14);
    expect(t.accessorials).toEqual([{ key: 'percentovercontract', label: 'Percent Over Contract', amount: 35.14 }]);
  });

  it('treats a charge saved as "Other" as the same charge when the dollars agree', () => {
    const t = settleTrips([line('1', 'TRACTOR L/H', '1', 650), line('1', 'FUEL SURCHARGE', '3', 100), line('1', 'NEW YORK ARBITRARY', '3', 250)]);
    const other: TrueUpAccessorialRow[] = [{ id: 'O', load_id: 'L', accessorial_type: 'Other', amount: 250, percentage: 100 }];
    const plan = planTrueUp(t, [load({ net_revenue: 1000 })], other, settings);
    expect(plan.changes).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it('does not report a change for a share that is the same at a different percentage', () => {
    const t = settleTrips([line('1', 'TRACTOR L/H', '1', 650), line('1', 'FUEL SURCHARGE', '3', 100), line('1', 'STOP OFFS', '3', 65)]);
    const sixtyFive: TrueUpAccessorialRow[] = [{ id: 'S', load_id: 'L', accessorial_type: 'Stop Off', amount: 100, percentage: 65 }];
    const plan = planTrueUp(t, [load({ net_revenue: 815 })], sixtyFive, settings);
    expect(plan.changes).toHaveLength(0);
  });

  it('keeps the stored rate when it already gives the settled linehaul to the cent', () => {
    const t = settleTrips([line('1', 'TRACTOR L/H', '1', 1919.29), line('1', 'FUEL SURCHARGE', '3', 100)]);
    const plan = planTrueUp(t, [load({ rate: 2952.76, net_revenue: 2019.29, accessorials: 0 })], [], settings);
    expect(plan.changes).toHaveLength(0);
  });
});
