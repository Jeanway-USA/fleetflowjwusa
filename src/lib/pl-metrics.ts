import { isAdvanceExpense, isCreditExpense, isEscrowReturn } from '@/lib/expense-types';

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
  description?: string | null;
}

/**
 * Effect of one expense row on profit, as a cost: positive adds cost, negative is a credit.
 * Card advances are early access to funds, not costs, so they count as zero. Fuel discounts
 * and reimbursements bring money back, so they reduce cost.
 */
export function expenseCost(expense: CostExpense): number {
  const row = expense as never;
  if (isAdvanceExpense(row) || isEscrowReturn(expense)) return 0;
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

// --------------------------------------------------------------------------
// Driver pay
// --------------------------------------------------------------------------

interface SettlementPayRow {
  driver_id?: string | null;
  period_end?: string | null;
  status?: string | null;
  gross_pay?: number | string | null;
  reimbursements?: number | string | null;
}

interface SafetyBonusRow {
  period_end?: string | null;
  status?: string | null;
  earned_amount?: number | string | null;
  /** Set when the bonus was folded into a settlement, whose gross pay already counts it. */
  paid_in_settlement_id?: string | null;
}

interface PayrollBatchRow {
  driver_id?: string | null;
  period_end?: string | null;
  net_pay?: number | string | null;
}

/** Settlements that count as money owed or paid to the driver. A draft is only a preview. */
const COUNTED_SETTLEMENT_STATUSES = new Set(['approved', 'paid']);

/**
 * What one driver settlement costs the company: the driver's gross pay plus reimbursements. Net pay
 * is not used, because taxes and advances withheld are still company money going out.
 */
export function driverSettlementCost(settlement: SettlementPayRow): number {
  if (!COUNTED_SETTLEMENT_STATUSES.has(String(settlement.status ?? '').toLowerCase())) return 0;
  return (Number(settlement.gross_pay) || 0) + (Number(settlement.reimbursements) || 0);
}

/**
 * What a safety bonus costs: the amount earned, once it is approved or paid. Pending bonuses are only
 * generated, void ones were cancelled, and one already paid inside a settlement is in that settlement.
 */
export function safetyBonusCost(bonus: SafetyBonusRow): number {
  if (bonus.paid_in_settlement_id) return 0;
  if (!COUNTED_SETTLEMENT_STATUSES.has(String(bonus.status ?? '').toLowerCase())) return 0;
  return Number(bonus.earned_amount) || 0;
}

export interface DriverPayTotals {
  total: number;
  settlementPay: number;
  batchPay: number;
  bonusPay: number;
  settlementCount: number;
  batchCount: number;
  bonusCount: number;
}

/**
 * Driver pay for a period from both places it can live: generated settlement statements and W-2
 * payroll batches. If a driver has both for the same period end, the settlement is the one
 * counted, so the same week is never charged twice.
 */
export function driverPayTotals(settlements: SettlementPayRow[], batches: PayrollBatchRow[], bonuses: SafetyBonusRow[] = []): DriverPayTotals {
  const counted = settlements.filter((s) => driverSettlementCost(s) > 0);
  const settledKeys = new Set(counted.map((s) => `${s.driver_id ?? ''}|${s.period_end ?? ''}`));
  const batchRows = batches.filter((b) => !settledKeys.has(`${b.driver_id ?? ''}|${b.period_end ?? ''}`));
  const settlementPay = counted.reduce((sum, s) => sum + driverSettlementCost(s), 0);
  const batchPay = batchRows.reduce((sum, b) => sum + (Number(b.net_pay) || 0), 0);
  const countedBonuses = bonuses.filter((b) => safetyBonusCost(b) > 0);
  const bonusPay = countedBonuses.reduce((sum, b) => sum + safetyBonusCost(b), 0);
  return {
    total: Math.round((settlementPay + batchPay + bonusPay) * 100) / 100,
    settlementPay: Math.round(settlementPay * 100) / 100,
    batchPay: Math.round(batchPay * 100) / 100,
    bonusPay: Math.round(bonusPay * 100) / 100,
    settlementCount: counted.length,
    batchCount: batchRows.length,
    bonusCount: countedBonuses.length,
  };
}

/** Each driver payment as a dated cost, for charts that bucket by week. Same counting rules as driverPayTotals. */
export function driverPayEvents(settlements: SettlementPayRow[], batches: PayrollBatchRow[], bonuses: SafetyBonusRow[] = []): Array<{ date: string; amount: number }> {
  const counted = settlements.filter((s) => driverSettlementCost(s) > 0 && s.period_end);
  const settledKeys = new Set(counted.map((s) => `${s.driver_id ?? ''}|${s.period_end}`));
  return [
    ...counted.map((s) => ({ date: String(s.period_end), amount: driverSettlementCost(s) })),
    ...batches
      .filter((b) => b.period_end && !settledKeys.has(`${b.driver_id ?? ''}|${b.period_end}`))
      .map((b) => ({ date: String(b.period_end), amount: Number(b.net_pay) || 0 })),
    ...bonuses
      .filter((b) => b.period_end && safetyBonusCost(b) > 0)
      .map((b) => ({ date: String(b.period_end), amount: safetyBonusCost(b) })),
  ];
}
