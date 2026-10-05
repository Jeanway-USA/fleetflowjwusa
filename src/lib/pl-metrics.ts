import { isAdvanceExpense, isCreditExpense } from '@/lib/expense-types';

/**
 * Profit and loss rules shared by every figure on the Money page, so the summary, the
 * per-mile ratios, the trend chart and the runway can never disagree.
 *
 * Revenue is the truck's revenue (65% of linehaul plus fuel surcharge and accessorials), the
 * way Landstar's own P&L workbook counts it. Gross is what the customer is billed; Landstar
 * keeps the rest, so gross is never income.
 */

interface RevenueLoad {
  net_revenue?: number | string | null;
  truck_revenue?: number | string | null;
  gross_revenue?: number | string | null;
}

/** What the truck earns on a load. Falls back to gross only when no split was ever computed. */
export function truckRevenueOf(load: RevenueLoad): number {
  const net = Number(load.net_revenue);
  if (Number.isFinite(net) && net > 0) return net;
  const truck = Number(load.truck_revenue);
  if (Number.isFinite(truck) && truck > 0) return truck;
  return Number(load.gross_revenue) || 0;
}

interface CostExpense {
  expense_type?: string | null;
  amount?: number | string | null;
  notes?: string | null;
}

/**
 * Effect of one expense row on profit, as a cost: positive adds cost, negative is a credit.
 * Card advances are early access to funds, not costs, so they count as zero. Fuel discounts
 * and reimbursements bring money back, so they reduce cost.
 */
export function expenseCost(expense: CostExpense): number {
  const row = expense as never;
  if (isAdvanceExpense(row)) return 0;
  const amount = Number(expense.amount) || 0;
  if (isCreditExpense(row)) return -Math.abs(amount);
  return amount;
}

/** Truck loan payments are posted to a loan ledger; any mirrored expense rows must not count twice. */
export const MIRRORED_LOAN_EXPENSE_TYPE = 'Truck Loan';

export interface FuelStats {
  gallons: number;
  /** Fuel purchases before discounts. */
  cost: number;
  /** Fuel discounts, as a positive number. */
  discounts: number;
  /** What the fuel really cost: purchases less discounts. */
  netCost: number;
  /** Average price per gallon after discounts, 0 when no gallons were recorded. */
  costPerGallon: number;
}

export function fuelStats(expenses: Array<{ expense_type?: string | null; amount?: number | string | null; gallons?: number | string | null }>): FuelStats {
  let gallons = 0;
  let cost = 0;
  let discounts = 0;
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    if (e.expense_type === 'Fuel') {
      cost += amount;
      gallons += Number(e.gallons) || 0;
    } else if (e.expense_type === 'Fuel Discount') {
      discounts += Math.abs(amount);
    }
  }
  const netCost = cost - discounts;
  return { gallons, cost, discounts, netCost, costPerGallon: gallons > 0 ? netCost / gallons : 0 };
}

export interface WorkbookMetrics {
  avgRevenuePerLoad: number;
  avgRevenuePerLoadWithoutFsc: number;
  fscShareOfRevenue: number;
  avgMilesPerLoad: number;
  milesPerGallon: number;
  /** Cost per gallon after the fuel surcharge you collect covers part of it (Landstar's "CPG with FSC"). */
  costPerGallonAfterFsc: number;
}

/** The figures Landstar's BCO workbook calls out on its yearly P&L. */
export function workbookMetrics(input: {
  loadCount: number;
  /** Truck revenue, which already includes the fuel surcharge. */
  revenue: number;
  fuelSurcharge: number;
  actualMiles: number;
  fuel: FuelStats;
}): WorkbookMetrics {
  const { loadCount, revenue, fuelSurcharge, actualMiles, fuel } = input;
  const milesPerGallon = fuel.gallons > 0 && actualMiles > 0 ? actualMiles / fuel.gallons : 0;
  const fscPerGallon = actualMiles > 0 && milesPerGallon > 0 ? (fuelSurcharge / actualMiles) * milesPerGallon : 0;
  return {
    avgRevenuePerLoad: loadCount > 0 ? revenue / loadCount : 0,
    avgRevenuePerLoadWithoutFsc: loadCount > 0 ? (revenue - fuelSurcharge) / loadCount : 0,
    fscShareOfRevenue: revenue > 0 ? fuelSurcharge / revenue : 0,
    avgMilesPerLoad: loadCount > 0 ? actualMiles / loadCount : 0,
    milesPerGallon,
    costPerGallonAfterFsc: fuel.costPerGallon > 0 ? fuel.costPerGallon - fscPerGallon : 0,
  };
}
