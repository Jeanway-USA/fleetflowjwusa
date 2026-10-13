import { describe, expect, it } from 'vitest';
import { settleTrips, planTrueUp, type SettlementLine, type TrueUpLoad, type TrueUpAccessorialRow } from '@/lib/settlement-trueup';

const line = (trip: string, description: string, code: string, amount: number, delivery: string | null = null): SettlementLine => ({ trip, description, code, amount, delivery, lane: null });
const settings = { truckPct: 0.65, trailerPct: 0.07, advancePct: 0.3, ownsTrailer: false, powerOnlyPct: 0.7 };

// Lines copied from Landstar's year-to-date Freight Bill Details export.
const revised = [
  line('6725288', 'TRACTOR L/H', '1', 1929.2),
  line('6725288', 'FUEL SURCHARGE', '3', 563.92),
  line('6725288', 'STOP OFFS', '3', 406.25),
  line('6725288', 'TRIP% ESCROW PAYMENT', 'C', -296.8),
  line('6725288', 'CARD PRE-TRIP', 'V', -1641.82),
  line('6725288', 'Updtd FB From Agency', '1', 2186.6),
  line('6725288', 'Updtd FB From Agency', 'X', -1929.2),
  line('6725288', 'FUEL SURCHARGE', '3', 639.16),
  line('6725288', 'FUEL SURCHARGE', 'X', -563.92),
  line('6725288', 'LAYOVER', '3', 162.5),
  line('6725288', 'STOP OFFS', '3', 471.25),
  line('6725288', 'STOP OFFS', 'X', -406.25),
];

describe('settleTrips', () => {
  it('nets a revised bill: reversals cancel the lines they replace', () => {
    const [t] = settleTrips(revised);
    expect(t.linehaul).toBe(2186.6);
    expect(t.fsc).toBe(639.16);
    expect(t.accessorials.map((a) => [a.label, a.amount]).sort()).toEqual([['Layover', 162.5], ['Stop Off', 471.25]]);
    expect(t.total).toBe(3459.51); // Landstar's revenue for the trip
  });

  it('ignores fees, advances and escrow', () => {
    const [t] = settleTrips([line('1', 'TRACTOR L/H', '1', 1000), line('1', 'CARD FEE', 'B', -3.5), line('1', 'CARD PRE-TRIP', 'V', -500)]);
    expect(t.total).toBe(1000);
  });

  it('handles a line that is reissued under another name (Update Detention)', () => {
    const [t] = settleTrips([
      line('1027900', 'TRACTOR L/H', '1', 671.45),
      line('1027900', 'FUEL SURCHARGE', '3', 207.92),
      line('1027900', 'Update Detention', '1', 671.45),
      line('1027900', 'Update Detention', 'X', -671.45),
      line('1027900', 'FUEL SURCHARGE', '3', 207.92),
      line('1027900', 'FUEL SURCHARGE', 'X', -207.92),
      line('1027900', 'DETENTION', '3', 255),
    ]);
    expect(t.total).toBe(1134.37);
    expect(t.accessorials).toEqual([{ key: 'detention', label: 'Detention', amount: 255 }]);
  });

  it('marks a trip with no linehaul line as incomplete', () => {
    const [t] = settleTrips([line('9', 'LAYOVER', '3', 195)]);
    expect(t.hasLinehaul).toBe(false);
  });
});

const load = (over: Partial<TrueUpLoad>): TrueUpLoad => ({
  id: 'L1', landstar_load_id: '6725288', status: 'delivered', delivery_date: '2026-02-11', rate: 2968, fuel_surcharge: 563.92, lumper: 0, advance_taken: 0,
  is_power_only: false, start_miles: null, end_miles: null, net_revenue: 3061.87, accessorials: 568.75, gross_revenue: 4100.67, truck_revenue: 3061.87,
  trailer_revenue: 0, settlement: 3061.87, advance_available: 0, actual_miles: null, ...over,
});
const rows: TrueUpAccessorialRow[] = [
  { id: 'A1', load_id: 'L1', accessorial_type: 'Layover', amount: 162.5, percentage: 100 },
  { id: 'A2', load_id: 'L1', accessorial_type: 'Stop-off', amount: 625, percentage: 65 },
];

describe('planTrueUp', () => {
  it('moves a load to the settled figures and explains what changed', () => {
    const plan = planTrueUp(settleTrips(revised), [load({})], rows, settings);
    expect(plan.changes).toHaveLength(1);
    const c = plan.changes[0];
    expect(c.patch.rate).toBe(3364); // 2186.60 / 0.65
    expect(c.patch.fuel_surcharge).toBe(639.16);
    expect(c.after).toBe(3459.51);
    expect(c.notes.join('|')).toContain('Fuel surcharge $563.92 to $639.16');
    expect(c.ops).toContainEqual({ kind: 'update', id: 'A2', type: 'Stop-off', amount: 471.25, percentage: 100, was: 625 });
    expect(plan.revenueChange).toBeCloseTo(397.64, 2);
  });

  it('leaves a load that already matches', () => {
    const settled = load({ rate: 3364, fuel_surcharge: 639.16, net_revenue: 3459.51, accessorials: 633.75 });
    const matching: TrueUpAccessorialRow[] = [
      { id: 'A1', load_id: 'L1', accessorial_type: 'Layover', amount: 162.5, percentage: 100 },
      { id: 'A2', load_id: 'L1', accessorial_type: 'Stop Off', amount: 471.25, percentage: 100 },
    ];
    const plan = planTrueUp(settleTrips(revised), [settled], matching, settings);
    expect(plan.changes).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it('adds a charge Landstar paid that the load never had, and zeroes one it did not', () => {
    const t = settleTrips([line('5', 'TRACTOR L/H', '1', 1300), line('5', 'FUEL SURCHARGE', '3', 100), line('5', 'LUMPER CHARGE', '3', 495)]);
    const l = load({ id: 'L5', landstar_load_id: '5', rate: 2000, fuel_surcharge: 100, net_revenue: 1401.5, accessorials: 1.5 });
    const fee: TrueUpAccessorialRow[] = [{ id: 'F', load_id: 'L5', accessorial_type: 'Transaction Processing Fee', amount: 1.5, percentage: 100 }];
    const plan = planTrueUp(t, [l], fee, settings);
    expect(plan.changes[0].ops).toContainEqual({ kind: 'insert', load_id: 'L5', type: 'Lumper', amount: 495, percentage: 100 });
    expect(plan.changes[0].ops).toContainEqual(expect.objectContaining({ kind: 'update', id: 'F', amount: 0 }));
    expect(plan.changes[0].after).toBe(1895);
  });

  it('leaves a trip alone when the file shows only part of it', () => {
    const plan = planTrueUp(settleTrips([line('6725288', 'LAYOVER', '3', 162.5)]), [load({})], rows, settings);
    expect(plan.changes).toHaveLength(0);
    expect(plan.partial).toEqual(['6725288']);
  });

  it('spots a mistyped trip number and lists settled trips that are missing', () => {
    const t = settleTrips([
      line('9577265', 'TRACTOR L/H', '1', 1078), line('9577265', 'FUEL SURCHARGE', '3', 580.38, '2026-05-02'),
      line('1855798', 'TRACTOR L/H', '1', 900), line('1855798', 'FUEL SURCHARGE', '3', 668.13),
    ]);
    const typo = load({ id: 'T', landstar_load_id: '9577024', delivery_date: '2026-05-02', net_revenue: 1658.38 });
    const plan = planTrueUp(t, [typo], [], settings);
    expect(plan.renames).toEqual([{ id: 'T', from: '9577024', to: '9577265', total: 1658.38 }]);
    expect(plan.missing.map((m) => m.trip)).toEqual(['1855798']);
  });

  it('lists delivered loads inside the file dates that Landstar has not settled', () => {
    const t = settleTrips([line('7', 'TRACTOR L/H', '1', 650, '2026-03-01'), line('8', 'TRACTOR L/H', '1', 650, '2026-04-01')]);
    const other = load({ id: 'U', landstar_load_id: '555', delivery_date: '2026-03-15' });
    const plan = planTrueUp(t, [other], [], settings);
    expect(plan.unsettled).toEqual([{ id: 'U', trip: '555', delivery: '2026-03-15' }]);
  });
});
