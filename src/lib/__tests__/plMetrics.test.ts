import { describe, it, expect } from 'vitest';
import { expenseCost, fuelStats, truckRevenueOf, workbookMetrics } from '@/lib/pl-metrics';

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
