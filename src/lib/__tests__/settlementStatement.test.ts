import { describe, it, expect } from 'vitest';
import { buildSettlementStatement, type StatementExpense, type StatementLoad } from '@/lib/settlement-statement';

// Contractor Statement, period ending 9/30/26 (unit T433780), week Thu 9/24 to Wed 9/30.
// Revenue per trip is the statement's own: TRACTOR L/H at 65% plus FUEL SURCHARGE at 100%.
const load = (id: string, trip: string, delivery: string, netRevenue: number, fsc: number): StatementLoad => ({
  id, landstar_load_id: trip, agency_code: null, origin: 'A, GA', destination: 'B, GA',
  pickup_date: delivery, delivery_date: delivery, status: 'delivered',
  fuel_surcharge: fsc, accessorials: 0, net_revenue: netRevenue, truck_id: 't1',
});

const loads: StatementLoad[] = [
  load('l1', '1121039', '2026-09-29', 2149.40, 569.70),  // 1,579.70 + 569.70
  load('l2', '9904275', '2026-09-27', 2142.11, 709.95),  // 1,432.16 + 709.95
  load('l3', '8357683', '2026-09-24', 3074.96, 997.92),  // 2,077.04 + 997.92
];

const exp = (id: string, date: string, type: string, amount: number, description: string, loadId: string | null = null, extra: Partial<StatementExpense> = {}): StatementExpense => ({
  id, expense_date: date, expense_type: type, amount, description, vendor: null, gallons: null,
  load_id: loadId, truck_id: 't1', notes: null, ...extra,
});

const advance = (id: string, date: string, amount: number, description: string, loadId: string | null) =>
  exp(id, date, 'Advance', amount, description, loadId, { notes: 'Advance (Non-P&L)' });

const expenses: StatementExpense[] = [
  exp('e1', '2026-09-28', 'Card Fee', 1.75, 'CARD FEE', 'l1'),
  exp('e2', '2026-09-30', 'Trip Scanning', 2, 'TRKSTP SCN CQQ 1121039', 'l1'),
  advance('e3', '2026-09-28', 1541.82, 'CARD PRE-TRIP', 'l1'),
  exp('e4', '2026-09-24', 'Card Fee', 1.75, 'CARD FEE', 'l2'),
  exp('e5', '2026-09-29', 'Trip Scanning', 2, 'TRKSTP SCN DLS 9904275', 'l2'),
  advance('e6', '2026-09-24', 1591.27, 'CARD PRE-TRIP', 'l2'),
  exp('e7', '2026-09-22', 'Card Fee', 1.75, 'CARD FEE', 'l3'),   // dated by pickup, before the week starts
  exp('e8', '2026-09-24', 'Card Fee', 1.75, 'CARD FEE', 'l3'),
  exp('e9', '2026-09-26', 'Trip Scanning', 2, 'TRKSTP SCN GDR 8357683', 'l3'),
  advance('e10', '2026-09-24', 400, 'CARD PRE-TRIP', 'l3'),
  advance('e11', '2026-09-24', 1500, 'CARD PRE-TRIP', 'l3'),
  exp('e12', '2026-09-30', 'Insurance', 33.98, 'UNLADEN LIABILITY STD P'),
  exp('e13', '2026-09-30', 'LCN/Satellite', 3.69, 'LCN FEES - CONT.'),
  exp('e14', '2026-09-30', 'PrePass/Scale', 2.5, 'PREPASS'),
  exp('e15', '2026-09-25', 'Tolls', 10, 'BP DelDOT 09/22/26'),
  exp('e16', '2026-09-26', 'Tolls', 35, 'BP DRBA 09/22/26'),
  // Card activity: not Landstar deductions.
  exp('e17', '2026-09-24', 'Fuel', 406.84, 'Fuel Purchase: AR307 NORTH LITTLE AR', null, { gallons: 65, vendor: 'PETRO FUEL #326' }),
  exp('e18', '2026-09-24', 'Fuel Discount', -47.65, 'NATS Discount: AR307 NORTH LITTLE AR'),
  exp('e19', '2026-09-24', 'DEF', 27.44, 'DEF Pumped NORTH LITTLE AR', null, { gallons: 5.6 }),
  advance('e20', '2026-09-24', 500, 'Direct-Deposit Bank Ref-640088299', null),
];

const statement = buildSettlementStatement({ loads, expenses, weekStart: '2026-09-24', weekEnd: '2026-09-30', truckId: 't1' });
const trip = (n: string) => statement.trips.find(t => t.trip === n)!;

describe('buildSettlementStatement against the 9/30/26 Landstar statement', () => {
  it('nets each trip exactly like the statement lines', () => {
    expect(trip('1121039').net).toBe(603.83);
    expect(trip('9904275').net).toBe(547.09);
    // 3,074.96 - (1.75 + 1.75 card fees + 2.00 scan + 400 + 1,500 advances); the 9/22 fee is dated by pickup.
    expect(trip('8357683').net).toBe(1169.46);
  });

  it('totals revenue to the statement revenue', () => {
    expect(statement.totals.revenue).toBe(7366.47);
  });

  it('keeps card advances separate from fees and other charges', () => {
    expect(statement.totals.advances).toBeCloseTo(1541.82 + 1591.27 + 400 + 1500, 2);
    expect(statement.totals.fees).toBeCloseTo(1.75 + 2 + 1.75 + 2 + 1.75 + 1.75 + 2, 2);
    expect(statement.totals.charges).toBeCloseTo(33.98 + 3.69 + 2.5 + 10 + 35, 2);
  });

  it('puts tolls under adjustments and insurance under scheduled', () => {
    expect(statement.charges.filter(c => c.group === 'adjustment').map(c => c.label)).toEqual(['Tolls', 'Tolls']);
    expect(statement.charges.find(c => c.label === 'Insurance')?.group).toBe('scheduled');
  });

  it('does not count card fuel, DEF, discounts or cash to the bank as deductions', () => {
    expect(statement.card.fuelGallons).toBe(65);
    expect(statement.card.fuelSpend).toBe(406.84);
    expect(statement.card.defSpend).toBe(27.44);
    expect(statement.card.discounts).toBe(47.65);
    expect(statement.card.cashToBank).toBe(500);
    expect(statement.totals.deductions).toBe(
      statement.totals.advances + statement.totals.fees + statement.totals.charges,
    );
  });

  it('computes net as revenue minus every deduction', () => {
    expect(statement.totals.net).toBe(
      Math.round((statement.totals.revenue - statement.totals.deductions) * 100) / 100,
    );
  });
});

describe('buildSettlementStatement edge cases', () => {
  it('shows a charges-only trip for an older load settling this week', () => {
    const s = buildSettlementStatement({
      loads: [{ ...load('old', '1209900', '2026-08-26', 2000, 400) }],
      expenses: [
        exp('a', '2026-09-28', 'Card Fee', 1.75, 'CARD FEE', 'old'),
        advance('b', '2026-09-28', 3000, 'CARD PRE-TRIP', 'old'),
      ],
      weekStart: '2026-09-24', weekEnd: '2026-09-30',
    });
    expect(s.trips).toHaveLength(1);
    expect(s.trips[0]).toMatchObject({ trip: '1209900', chargesOnly: true, revenue: 0 });
    expect(s.trips[0].net).toBe(-3001.75);
  });

  it('reports no statement lines when nothing was imported for the week', () => {
    const s = buildSettlementStatement({ loads, expenses: [], weekStart: '2026-09-24', weekEnd: '2026-09-30' });
    expect(s.hasStatementLines).toBe(false);
    expect(s.totals.deductions).toBe(0);
    expect(s.totals.net).toBe(7366.47);
  });

  it('filters by truck', () => {
    const s = buildSettlementStatement({ loads, expenses, weekStart: '2026-09-24', weekEnd: '2026-09-30', truckId: 'other' });
    expect(s.trips).toHaveLength(0);
    expect(s.totals.net).toBe(0);
  });
});

// Week ending 10/7/26: Landstar settled three trips for $7,880.92 and left 1894988 outstanding.
describe('buildSettlementStatement against the 10/7/26 Landstar statement', () => {
  const l = (id: string, trip: string, delivery: string, net: number, fsc: number, acc = 0): StatementLoad => ({ ...load(id, trip, delivery, net, fsc), accessorials: acc });
  const week = {
    loads: [
      l('a', '1456639', '2026-10-01', 2325, 700),
      l('b', '1369039', '2026-10-05', 3824.67, 937.17, 81.25),
      l('c', '1644247', '2026-10-02', 1731.25, 670, 200),
      l('d', '1894988', '2026-10-07', 1543.3, 385.01), // delivered Wednesday, not settled yet
    ],
    expenses: [
      exp('s1', '2026-10-02', 'Trip Scanning', 2, 'TRKSTP SCN NHD 1456639', 'a'),
      exp('s2', '2026-10-01', 'Card Fee', 1.75, 'CARD FEE', 'b'), exp('s3', '2026-10-06', 'Trip Scanning', 2, 'TRKSTP SCN LTL 1369039', 'b'), advance('s4', '2026-10-01', 2714.09, 'CARD PRE-TRIP', 'b'),
      exp('s5', '2026-10-02', 'Card Fee', 1.75, 'CARD FEE', 'c'), exp('s6', '2026-10-03', 'Trip Scanning', 2, 'TRKSTP SCN RKV 1644247', 'c'), advance('s7', '2026-10-02', 1280, 'CARD PRE-TRIP', 'c'),
      exp('s8', '2026-10-07', 'Insurance', 33.98, 'UNLADEN LIABILITY STD P'),
      // The card moves money to the bank for $1 a time; that is the card's fee, not a settlement deduction.
      exp('s9', '2026-10-01', 'Direct Deposit Fee', 1, 'Direct-Deposit Fee'),
    ],
    weekStart: '2026-10-01', weekEnd: '2026-10-07', truckId: 't1',
  };
  const s = buildSettlementStatement(week);

  it('counts only the trips Landstar settled and lists the rest as waiting', () => {
    expect(s.trips.map(t => t.trip).sort()).toEqual(['1369039', '1456639', '1644247']);
    expect(s.totals.revenue).toBe(7880.92);
    expect(s.waiting.map(t => t.trip)).toEqual(['1894988']);
  });

  it("keeps the card's direct-deposit fee out of the settlement deductions", () => {
    expect(s.totals.charges).toBe(33.98);
    expect(s.card.cardFees).toBe(1);
  });

  it('settles a trip in the week of its scan, not the week it delivered', () => {
    // Delivered Wednesday 10/7, scanned Thursday 10/8: it belongs to the next week.
    const next = buildSettlementStatement({
      ...week,
      expenses: [...week.expenses, exp('n1', '2026-10-08', 'Trip Scanning', 2, 'TRKSTP SCN PRM 1894988', 'd')],
      weekStart: '2026-10-08', weekEnd: '2026-10-14',
    });
    expect(next.trips.map(t => t.trip)).toEqual(['1894988']);
    expect(buildSettlementStatement({ ...week, expenses: [...week.expenses, exp('n1', '2026-10-08', 'Trip Scanning', 2, 'TRKSTP SCN PRM 1894988', 'd')] }).trips.map(t => t.trip)).not.toContain('1894988');
  });
});
