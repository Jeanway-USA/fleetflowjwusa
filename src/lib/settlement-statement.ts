import { isAdvanceExpense } from '@/lib/expense-types';
import { cityState } from '@/lib/formatters';
import { roundCents } from '@/lib/revenue-calculator';

/**
 * One Landstar settlement week laid out the way the weekly Contractor Statement is:
 * each trip with its revenue and the charges attached to it, then charges that belong to
 * no trip, then the totals. Revenue comes from the loads (65% of linehaul, fuel surcharge
 * at 100%); deductions come from the imported statement lines.
 *
 * Money the fuel card spends (fuel, DEF, scales, cash to the bank) is card activity, not a
 * Landstar deduction. It is funded by the pre-trip advance, which IS the deduction.
 */

export interface StatementLoad {
  id: string;
  landstar_load_id: string | null;
  agency_code: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  status: string | null;
  fuel_surcharge: number | null;
  accessorials: number | null;
  net_revenue: number | null;
  truck_id: string | null;
  has_statement_discrepancy?: boolean | null;
}

export interface StatementExpense {
  id: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  description: string | null;
  vendor: string | null;
  gallons: number | null;
  load_id: string | null;
  truck_id: string | null;
  notes: string | null;
}

export interface StatementTripLine {
  loadId: string;
  trip: string;
  agency: string | null;
  route: string;
  deliveryDate: string | null;
  /** Truck share of linehaul (net revenue less fuel surcharge and accessorials). */
  linehaul: number;
  fuelSurcharge: number;
  accessorials: number;
  revenue: number;
  /** Pre-trip advances Landstar loaded on the card for this trip (deducted from the trip). */
  advances: number;
  /** Card fees, direct-deposit fees and trip scanning on this trip. */
  fees: number;
  net: number;
  /** True when the trip has no revenue this week, only charges (an older trip settling). */
  chargesOnly: boolean;
  discrepancy: boolean;
}

export interface StatementCharge {
  id: string;
  date: string;
  label: string;
  description: string;
  amount: number;
  group: 'scheduled' | 'adjustment';
}

export interface FuelPurchase {
  id: string;
  date: string;
  place: string;
  gallons: number | null;
  amount: number;
  isDef: boolean;
}

export interface CardActivity {
  /** Pre-trip advances loaded on the card (also counted as trip deductions above). */
  loaded: number;
  fuel: FuelPurchase[];
  fuelSpend: number;
  fuelGallons: number;
  defSpend: number;
  /** Fuel discounts, as a positive number. */
  discounts: number;
  /** Cash moved from the card to the bank. */
  cashToBank: number;
}

export interface SettlementStatement {
  weekStart: string;
  weekEnd: string;
  trips: StatementTripLine[];
  charges: StatementCharge[];
  card: CardActivity;
  totals: {
    revenue: number;
    advances: number;
    fees: number;
    charges: number;
    deductions: number;
    net: number;
  };
  /** Any statement lines (advances, fees, deductions, card activity) exist for this week. */
  hasStatementLines: boolean;
}

const ADJUSTMENT_TYPES = new Set(['Tolls', 'IFTA']);
const FEE_TYPES = new Set(['Card Fee', 'Trip Scanning', 'Direct Deposit Fee']);
const CARD_USE_TYPES = new Set(['Fuel', 'DEF', 'Fuel Discount']);

const PRE_TRIP = /pre-?trip|card load|spec\.? adv|partial final|contractor pay/i;
const CASH_TO_BANK = /direct-?\s*deposit|\bdd\b|cash adv/i;
const CARD_PURCHASE = /cat scale|fuel purchase|def pumped/i;

const amountOf = (e: StatementExpense) => Number(e.amount) || 0;

export function isPreTripAdvance(e: StatementExpense): boolean {
  return isAdvanceExpense(e as never) && !CASH_TO_BANK.test(e.description ?? '') && (PRE_TRIP.test(e.description ?? '') || e.expense_type === 'Card Load');
}

function isCashToBank(e: StatementExpense): boolean {
  return isAdvanceExpense(e as never) && (CASH_TO_BANK.test(e.description ?? '') || e.expense_type === 'Direct Deposit' || e.expense_type === 'Cash Advance');
}

/** Fuel, DEF, discounts and scale tickets paid with the card. */
function isCardPurchase(e: StatementExpense): boolean {
  if (CARD_USE_TYPES.has(e.expense_type)) return true;
  // Scale tickets paid with the card, whichever type the importer filed them under.
  return /cat scale/i.test(e.description ?? '');
}

export interface BuildStatementOptions {
  loads: StatementLoad[];
  expenses: StatementExpense[];
  /** First and last day of the week, YYYY-MM-DD (Thursday to Wednesday). */
  weekStart: string;
  weekEnd: string;
  truckId?: string | null;
}

export function buildSettlementStatement({ loads, expenses, weekStart, weekEnd, truckId }: BuildStatementOptions): SettlementStatement {
  const inWeek = (d: string | null | undefined) => !!d && d >= weekStart && d <= weekEnd;
  const forTruck = <T extends { truck_id: string | null }>(row: T) => !truckId || truckId === 'all' || row.truck_id === truckId;

  const weekLoads = loads.filter(l => l.status === 'delivered' && inWeek(l.delivery_date) && forTruck(l));
  // The date in front of a statement line is the trip's pickup date, not when the charge posted,
  // so a charge on a trip settling this week belongs to that trip whatever its date. Charges
  // with no trip, or on a trip not settling this week, fall back to the week by date.
  const settlingIds = new Set(weekLoads.map(l => l.id));
  const weekExpenses = expenses.filter(e => forTruck(e) && ((e.load_id && settlingIds.has(e.load_id)) || inWeek(e.expense_date)));

  const lineFor = (load: StatementLoad | null, loadId: string): StatementTripLine => {
    const revenue = load ? roundCents(load.net_revenue ?? 0) : 0;
    const fuelSurcharge = load ? roundCents(load.fuel_surcharge ?? 0) : 0;
    const accessorials = load ? roundCents(load.accessorials ?? 0) : 0;
    return {
      loadId,
      trip: load?.landstar_load_id ?? '',
      agency: load?.agency_code || null,
      route: load ? `${cityState(load.origin)} to ${cityState(load.destination)}` : '',
      deliveryDate: load?.delivery_date ?? null,
      linehaul: roundCents(revenue - fuelSurcharge - accessorials),
      fuelSurcharge,
      accessorials,
      revenue,
      advances: 0,
      fees: 0,
      net: revenue,
      chargesOnly: !load,
      discrepancy: !!load?.has_statement_discrepancy,
    };
  };

  const trips = new Map<string, StatementTripLine>();
  weekLoads.forEach(l => trips.set(l.id, lineFor(l, l.id)));

  const loadById = new Map(loads.map(l => [l.id, l]));
  const charges: StatementCharge[] = [];
  const fuel: FuelPurchase[] = [];
  let loaded = 0;
  let cashToBank = 0;
  let discounts = 0;
  let defSpend = 0;
  let fuelSpend = 0;
  let fuelGallons = 0;
  let hasStatementLines = false;

  const tripFor = (loadId: string): StatementTripLine => {
    let line = trips.get(loadId);
    if (!line) {
      line = lineFor(null, loadId);
      const load = loadById.get(loadId);
      if (load) {
        line.trip = load.landstar_load_id ?? '';
        line.agency = load.agency_code || null;
        line.route = `${cityState(load.origin)} to ${cityState(load.destination)}`;
      }
      trips.set(loadId, line);
    }
    return line;
  };

  for (const e of weekExpenses) {
    const amount = amountOf(e);
    hasStatementLines = true;

    if (isCashToBank(e)) { cashToBank += Math.abs(amount); continue; }

    if (isPreTripAdvance(e)) {
      loaded += Math.abs(amount);
      if (e.load_id) tripFor(e.load_id).advances += Math.abs(amount);
      else charges.push({ id: e.id, date: e.expense_date, label: 'Card advance', description: e.description ?? 'Card advance', amount: Math.abs(amount), group: 'scheduled' });
      continue;
    }

    if (isAdvanceExpense(e as never)) {
      // Any other advance (special advance, etc.) is a deduction from the settlement.
      if (e.load_id) tripFor(e.load_id).advances += Math.abs(amount);
      else charges.push({ id: e.id, date: e.expense_date, label: 'Advance', description: e.description ?? 'Advance', amount: Math.abs(amount), group: 'scheduled' });
      continue;
    }

    if (isCardPurchase(e)) {
      if (e.expense_type === 'Fuel Discount') { discounts += Math.abs(amount); continue; }
      if (e.expense_type === 'DEF') { defSpend += amount; fuel.push({ id: e.id, date: e.expense_date, place: e.vendor || e.description || 'DEF', gallons: e.gallons, amount, isDef: true }); continue; }
      if (e.expense_type === 'Fuel') {
        fuelSpend += amount;
        fuelGallons += Number(e.gallons) || 0;
        fuel.push({ id: e.id, date: e.expense_date, place: e.vendor || e.description || 'Fuel', gallons: e.gallons, amount, isDef: false });
        continue;
      }
      // Scale tickets paid with the card count as card spend but not as fuel.
      fuel.push({ id: e.id, date: e.expense_date, place: e.description || 'Scale', gallons: null, amount, isDef: false });
      continue;
    }

    if (FEE_TYPES.has(e.expense_type) || (e.expense_type === 'Card Fee')) {
      if (e.load_id) tripFor(e.load_id).fees += amount;
      else charges.push({ id: e.id, date: e.expense_date, label: e.expense_type, description: e.description ?? e.expense_type, amount, group: 'scheduled' });
      continue;
    }

    // Everything else on the statement without a trip: scheduled deductions and adjustments.
    if (e.expense_type === 'Reimbursement' || amount < 0) continue; // credits are shown on Expenses, not as deductions
    charges.push({
      id: e.id,
      date: e.expense_date,
      label: e.expense_type,
      description: e.description ?? e.expense_type,
      amount,
      group: ADJUSTMENT_TYPES.has(e.expense_type) ? 'adjustment' : 'scheduled',
    });
  }

  const tripLines = [...trips.values()].map(t => {
    const advances = roundCents(t.advances);
    const fees = roundCents(t.fees);
    return { ...t, advances, fees, net: roundCents(t.revenue - advances - fees) };
  }).sort((a, b) => (b.deliveryDate ?? '').localeCompare(a.deliveryDate ?? '') || a.trip.localeCompare(b.trip));

  charges.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  fuel.sort((a, b) => a.date.localeCompare(b.date));

  const revenue = roundCents(tripLines.reduce((s, t) => s + t.revenue, 0));
  const advances = roundCents(tripLines.reduce((s, t) => s + t.advances, 0));
  const fees = roundCents(tripLines.reduce((s, t) => s + t.fees, 0));
  const chargesTotal = roundCents(charges.reduce((s, c) => s + c.amount, 0));
  const deductions = roundCents(advances + fees + chargesTotal);

  return {
    weekStart,
    weekEnd,
    trips: tripLines,
    charges,
    card: {
      loaded: roundCents(loaded),
      fuel,
      fuelSpend: roundCents(fuelSpend),
      fuelGallons: Math.round(fuelGallons * 1000) / 1000,
      defSpend: roundCents(defSpend),
      discounts: roundCents(discounts),
      cashToBank: roundCents(cashToBank),
    },
    totals: { revenue, advances, fees, charges: chargesTotal, deductions, net: roundCents(revenue - deductions) },
    hasStatementLines,
  };
}
