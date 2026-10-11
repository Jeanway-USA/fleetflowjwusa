import { describe, it, expect } from 'vitest';
import { driverPayEvents, driverPayTotals, driverSettlementCost, safetyBonusCost, expenseCost, fuelStats, truckRevenueOf, workbookMetrics } from '@/lib/pl-metrics';

describe('truckRevenueOf', () => {
  it('counts what the truck earns, never the gross billed to the customer', () => {
    // Load 1121039: gross 3,000.00, truck share 65% of 2,430.30 plus 569.70 fuel surcharge.
    expect(truckRevenueOf({ net_revenue: 2149.395, truck_revenue: 2149.395, gross_revenue: 3000 })).toBeCloseTo(2149.395, 3);
  });
  it('falls back to truck revenue, then gross, only when no split exists', () => {
    expect(truckRevenueOf({ net_revenue: 0, truck_revenue: 1800, gross_revenue: 3000 })).toBe(1800);
    expect(truckRevenueOf({ net_revenue: null, truck_revenue: null, gross_revenue: 3000 })).toBe(3000);
  });
});

describe('expenseCost', () => {
  it('keeps escrow released back to you out of profit, but still credits escrow interest', () => {
    expect(expenseCost({ expense_type: 'Reimbursement', description: 'REIMB VOLUNTARY ESCROW', amount: -6015.35 })).toBe(0);
    expect(expenseCost({ expense_type: 'Reimbursement', description: '4TH QTR ESCROW INT PAY', amount: -24.88 })).toBe(-24.88);
  });

  it('counts ordinary expenses as cost', () => {
    expect(expenseCost({ expense_type: 'Insurance', amount: 33.98 })).toBe(33.98);
    expect(expenseCost({ expense_type: 'Fuel', amount: 406.84 })).toBe(406.84);
  });
  it('ignores card advances because they are not costs', () => {
    expect(expenseCost({ expense_type: 'Advance', amount: 1541.82, notes: 'Advance (Non-P&L)' })).toBe(0);
    expect(expenseCost({ expense_type: 'Card Load', amount: 400 })).toBe(0);
  });
  it('treats fuel discounts and reimbursements as credits that reduce cost', () => {
    expect(expenseCost({ expense_type: 'Fuel Discount', amount: -47.65 })).toBe(-47.65);
    expect(expenseCost({ expense_type: 'Fuel Discount', amount: 47.65 })).toBe(-47.65);
    expect(expenseCost({ expense_type: 'Reimbursement', amount: 1972.99 })).toBe(-1972.99);
  });
});

describe('fuelStats', () => {
  // Card Activity Statement, week of 9/23 to 9/29/26 (fuel only, DEF and scale excluded).
  const purchases = [
    { expense_type: 'Fuel', amount: 271.53, gallons: 46.9 },
    { expense_type: 'Fuel Discount', amount: -3.28 },
    { expense_type: 'Fuel', amount: 300.74, gallons: 48.05 },
    { expense_type: 'Fuel Discount', amount: -35.22 },
    { expense_type: 'Fuel', amount: 406.84, gallons: 65 },
    { expense_type: 'Fuel Discount', amount: -47.65 },
    { expense_type: 'DEF', amount: 27.44, gallons: 5.6 },
  ];
  it('totals gallons and prices them after discounts', () => {
    const f = fuelStats(purchases);
    expect(f.gallons).toBeCloseTo(159.95, 2);
    expect(f.cost).toBeCloseTo(979.11, 2);
    expect(f.discounts).toBeCloseTo(86.15, 2);
    expect(f.netCost).toBeCloseTo(892.96, 2);
    expect(f.costPerGallon).toBeCloseTo(892.96 / 159.95, 4);
  });
  it('does not divide by zero with no gallons', () => {
    expect(fuelStats([]).costPerGallon).toBe(0);
  });
});

describe('workbookMetrics (Landstar BCO workbook definitions)', () => {
  const fuel = { gallons: 1000, cost: 6000, discounts: 500, netCost: 5500, costPerGallon: 5.5 };
  const m = workbookMetrics({ loadCount: 4, revenue: 12000, fuelSurcharge: 3000, actualMiles: 6500, fuel });

  it('averages revenue per load with and without the fuel surcharge', () => {
    expect(m.avgRevenuePerLoad).toBe(3000);
    expect(m.avgRevenuePerLoadWithoutFsc).toBe(2250);
  });
  it('gives the fuel surcharge as a share of revenue', () => {
    expect(m.fscShareOfRevenue).toBe(0.25);
  });
  it('computes miles per gallon and miles per load', () => {
    expect(m.milesPerGallon).toBe(6.5);
    expect(m.avgMilesPerLoad).toBe(1625);
  });
  it('subtracts the surcharge collected per gallon from the cost per gallon', () => {
    // FSC per mile 3000/6500 x 6.5 mpg = $3.00 a gallon; $5.50 - $3.00 = $2.50.
    expect(m.costPerGallonAfterFsc).toBeCloseTo(2.5, 6);
  });
  it('returns zeros when there is nothing to divide by', () => {
    const z = workbookMetrics({ loadCount: 0, revenue: 0, fuelSurcharge: 0, actualMiles: 0, fuel: { gallons: 0, cost: 0, discounts: 0, netCost: 0, costPerGallon: 0 } });
    expect(z).toEqual({ avgRevenuePerLoad: 0, avgRevenuePerLoadWithoutFsc: 0, fscShareOfRevenue: 0, avgMilesPerLoad: 0, milesPerGallon: 0, costPerGallonAfterFsc: 0 });
  });
});

describe('driver pay (Timothy Ames, 6/26 to 7/30/26)', () => {
  // The six real settlements: five paid, one approved.
  const settlements = [
    { driver_id: 't', period_end: '2026-06-26', status: 'paid', gross_pay: 1700, reimbursements: 18 },
    { driver_id: 't', period_end: '2026-07-02', status: 'paid', gross_pay: 1700, reimbursements: 24.38 },
    { driver_id: 't', period_end: '2026-07-09', status: 'paid', gross_pay: 0, reimbursements: 1360 },
    { driver_id: 't', period_end: '2026-07-16', status: 'paid', gross_pay: 2000, reimbursements: 0 },
    { driver_id: 't', period_end: '2026-07-23', status: 'paid', gross_pay: 2000, reimbursements: 100 },
    { driver_id: 't', period_end: '2026-07-30', status: 'approved', gross_pay: 2000, reimbursements: 0 },
  ];

  it('costs a settlement as gross pay plus reimbursements, never net pay', () => {
    expect(driverSettlementCost(settlements[1])).toBeCloseTo(1724.38, 2);
  });

  it('counts approved and paid settlements but not drafts', () => {
    expect(driverSettlementCost({ ...settlements[0], status: 'draft' })).toBe(0);
    expect(driverSettlementCost({ ...settlements[5] })).toBe(2000);
  });

  it('totals the whole run', () => {
    const t = driverPayTotals(settlements, []);
    expect(t.settlementCount).toBe(6);
    expect(t.total).toBeCloseTo(10902.38, 2);
  });

  it('never charges a week twice when a payroll batch also exists for it', () => {
    const t = driverPayTotals(settlements, [
      { driver_id: 't', period_end: '2026-07-16', net_pay: 1531.88 },
      { driver_id: 'other', period_end: '2026-07-16', net_pay: 500 },
    ]);
    expect(t.batchCount).toBe(1);
    expect(t.total).toBeCloseTo(10902.38 + 500, 2);
  });

  it('is zero when there are no settlements or batches', () => {
    expect(driverPayTotals([], []).total).toBe(0);
  });
});

describe('driverPayEvents', () => {
  it('dates each counted payment and skips a batch shadowed by a settlement', () => {
    const events = driverPayEvents(
      [{ driver_id: 't', period_end: '2026-07-16', status: 'paid', gross_pay: 2000, reimbursements: 0 }],
      [{ driver_id: 't', period_end: '2026-07-16', net_pay: 1531.88 }, { driver_id: 'o', period_end: '2026-07-23', net_pay: 500 }],
    );
    expect(events).toEqual([{ date: '2026-07-16', amount: 2000 }, { date: '2026-07-23', amount: 500 }]);
  });
});

describe('safety bonuses as driver cost', () => {
  const bonus = (o: Record<string, unknown> = {}) => ({ period_end: '2026-07-31', status: 'approved', earned_amount: 250, paid_in_settlement_id: null, ...o });

  it('counts an approved or paid bonus at the amount earned', () => {
    expect(safetyBonusCost(bonus())).toBe(250);
    expect(safetyBonusCost(bonus({ status: 'paid' }))).toBe(250);
  });

  it('ignores pending and void bonuses', () => {
    expect(safetyBonusCost(bonus({ status: 'pending' }))).toBe(0);
    expect(safetyBonusCost(bonus({ status: 'void' }))).toBe(0);
  });

  it('skips a bonus already paid inside a settlement, which counts it in gross pay', () => {
    expect(safetyBonusCost(bonus({ paid_in_settlement_id: 'abc' }))).toBe(0);
  });

  it('adds counted bonuses to driver pay and reports how many', () => {
    const t = driverPayTotals(
      [{ driver_id: 'd', period_end: '2026-07-16', status: 'paid', gross_pay: 2000, reimbursements: 0 }],
      [],
      [bonus(), bonus({ status: 'pending' }), bonus({ earned_amount: 100, status: 'paid' })],
    );
    expect(t.bonusCount).toBe(2);
    expect(t.bonusPay).toBe(350);
    expect(t.total).toBe(2350);
  });

  it('dates each counted bonus at the end of its month', () => {
    expect(driverPayEvents([], [], [bonus(), bonus({ status: 'void' })])).toEqual([{ date: '2026-07-31', amount: 250 }]);
  });
});
