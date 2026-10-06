import { describe, expect, it } from 'vitest';
import { expenseForMissingLine, proveTrips, type ProofExpense, type ProofLoad } from '@/lib/weekly-proof';
import type { SettlementLine } from '@/lib/settlement-trueup';

const line = (trip: string, description: string, code: string, amount: number, settled = '2026-09-30'): SettlementLine => ({ trip, description, code, amount, delivery: null, lane: null, settled, pickup: null });

// Trip 8357683 from the real 9/30 file.
const landstar = [
  line('8357683', 'TRACTOR L/H', '1', 2077.04),
  line('8357683', 'FUEL SURCHARGE', '3', 997.92),
  line('8357683', 'CARD FEE', 'B', -3.5),
  line('8357683', 'TRKSTP SCN GDR 8357683', 'B', -2),
  line('8357683', 'CARD PRE-TRIP', 'V', -1900),
  line('8357683', 'TRIP% ESCROW PAYMENT', 'C', -319.54),
];
const load: ProofLoad = { id: 'L', landstar_load_id: '8357683', net_revenue: 3074.96 };
const exp = (expense_type: string, amount: number): ProofExpense => ({ load_id: 'L', expense_type, amount });
const matching = [exp('Card Fee', 3.5), exp('Trip Scanning', 2), exp('Advance', 1900), exp('Fuel', 500)];

describe('proveTrips', () => {
  it('proves a trip whose revenue, charges and advances all agree (escrow and fuel are not charges)', () => {
    const r = proveTrips(landstar, [load], matching);
    expect(r.trips[0].issues).toEqual([]);
    expect(r.weeks[0]).toMatchObject({ week: '2026-09-30', proven: true, trips: 1 });
    expect(r.provenTrips).toBe(1);
  });

  it('flags charges that were never imported', () => {
    const r = proveTrips(landstar, [load], [exp('Card Fee', 3.5), exp('Advance', 1900)]);
    expect(r.trips[0].issues).toEqual(['charges']);
    expect(r.trips[0].landstar.charges).toBe(5.5);
    expect(r.trips[0].app.charges).toBe(3.5);
    expect(r.weeks[0].proven).toBe(false);
  });

  it('flags a duplicated charge as more than Landstar took', () => {
    const r = proveTrips(landstar, [load], [...matching, exp('Trip Scanning', 2)]);
    expect(r.trips[0].issues).toEqual(['charges']);
    expect(r.trips[0].app.charges).toBe(7.5);
  });

  it('flags revenue that has not been trued up, and a missing advance', () => {
    const r = proveTrips(landstar, [{ ...load, net_revenue: 3100 }], [exp('Card Fee', 3.5), exp('Trip Scanning', 2)]);
    expect(r.trips[0].issues).toEqual(['revenue', 'advances']);
  });

  it('names the exact lines behind a gap', () => {
    const dup: ProofExpense[] = [...matching, { id: 'dup', expense_date: '2026-04-04', load_id: 'L', expense_type: 'Trip Scanning', amount: 2, description: 'TRKSTP SCN GDR' }];
    const r = proveTrips(landstar, [load], dup);
    expect(r.trips[0].gaps.charges.surplus).toEqual([{ id: 'dup', date: '2026-04-04', description: 'TRKSTP SCN GDR', amount: 2 }]);
    expect(r.trips[0].gaps.charges.missing).toEqual([]);
    const lost = proveTrips(landstar, [load], [exp('Card Fee', 3.5), exp('Advance', 1900)]);
    expect(lost.trips[0].gaps.charges.missing).toEqual([{ description: 'TRKSTP SCN GDR 8357683', amount: 2 }]);
  });

  it('flags a settled trip that is not among the loads', () => {
    const r = proveTrips(landstar, [], []);
    expect(r.trips[0].issues).toEqual(['missing_load']);
  });

  it('does not compare revenue for a trip the file only partly shows', () => {
    const partial = [line('8357683', 'FUEL SURCHARGE', '3', 12), line('8357683', 'FUEL SURCHARGE', 'X', -9), line('8357683', 'CARD FEE', 'B', -3.5), line('8357683', 'TRKSTP SCN GDR 8357683', 'B', -2), line('8357683', 'CARD PRE-TRIP', 'V', -1900)];
    const r = proveTrips(partial, [load], matching);
    expect(r.trips[0].revenueComparable).toBe(false);
    expect(r.trips[0].issues).toEqual([]);
  });

  it('rolls trips up by the week they first settled', () => {
    const lines = [...landstar, line('1', 'TRACTOR L/H', '1', 650, '2026-09-23'), line('1', 'FUEL SURCHARGE', '3', 100, '2026-09-23')];
    const r = proveTrips(lines, [load, { id: 'M', landstar_load_id: '1', net_revenue: 750 }], matching);
    expect(r.weeks.map((w) => [w.week, w.trips, w.proven])).toEqual([['2026-09-30', 1, true], ['2026-09-23', 1, true]]);
  });
});

describe('expenseForMissingLine', () => {
  it('files Landstar lines under the right type', () => {
    expect(expenseForMissingLine({ description: 'TOLL CHARGES', amount: 117.76 }, 'charge')).toEqual({ expense_type: 'Tolls', description: 'TOLL CHARGES', amount: 117.76 });
    expect(expenseForMissingLine({ description: 'CARD FEE', amount: 1.75 }, 'charge').expense_type).toBe('Card Fee');
    expect(expenseForMissingLine({ description: 'TRKSTP SCN YGM 9577265', amount: 2 }, 'charge').expense_type).toBe('Trip Scanning');
    expect(expenseForMissingLine({ description: 'AD VALOREM TAX CHARGES', amount: 4.81 }, 'charge').expense_type).toBe('Taxes');
    expect(expenseForMissingLine({ description: 'CARD PRE-TRIP', amount: 410 }, 'advance').expense_type).toBe('Advance');
    expect(expenseForMissingLine({ description: 'SOMETHING NEW', amount: 5 }, 'charge').expense_type).toBe('Misc');
  });
});
