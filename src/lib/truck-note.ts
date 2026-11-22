/**
 * The truck note (loan payment) as a line in the weekly money views, so "what did we make" shows the payment the
 * owner actually carries.
 *
 * THE RULE (one rule, used everywhere): a week carries one twelfth-of-a-year share of the payments,
 *     weekly note = monthly payment x 12 / 52,
 * summed over the units that still owe on a loan. A longer period (month, quarter, year) carries that weekly share for
 * each 7 days in it. The share is the same every week, so the figure does not jump in the week the payment falls due.
 *
 * It is an allocation for the money views. The real installments are posted to the loan ledger (truck_loan_payments) on the
 * Trucks page and counted from there by the Profit & loss tab; nothing here writes to the ledger or to expenses.
 *
 * Not counted twice: if "Truck Payment" expenses are already recorded in the period (a payment entered or imported as an
 * expense), those recorded amounts are shown and the allocation is not added on top.
 */

export const WEEKS_PER_YEAR = 52;
export const MONTHS_PER_YEAR = 12;

export interface NoteTruck {
  unit_number?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  monthly_payment?: number | string | null;
  loan_balance?: number | string | null;
  loan_start_date?: string | null;
}

export interface RecordedPayment {
  expense_type: string;
  amount: number | string | null;
  expense_date?: string | null;
}

const num = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** One week's share of a monthly payment. */
export const weeklyNote = (monthlyPayment: number) => round2((monthlyPayment * MONTHS_PER_YEAR) / WEEKS_PER_YEAR);

/** Units that owe a payment: active, a payment set, balance not paid off, and the loan already started by the end of the period. */
export function unitsWithNote(trucks: NoteTruck[], periodEndIso: string): NoteTruck[] {
  return trucks.filter((t) => {
    if (t.deleted_at) return false;
    if (t.status === 'out_of_service') return false;
    if (num(t.monthly_payment) <= 0) return false;
    if (t.loan_balance !== null && t.loan_balance !== undefined && num(t.loan_balance) <= 0) return false;
    if (t.loan_start_date && t.loan_start_date > periodEndIso) return false;
    return true;
  });
}

export type NoteSource = 'allocated' | 'recorded' | 'none';

export interface TruckNote {
  /** Dollars carried by the period (positive; shown as a deduction). */
  amount: number;
  source: NoteSource;
  units: number;
  /** Whole weeks the period covers (days / 7). */
  weeks: number;
  /** One short sentence naming the rule, for the muted helper text. */
  rule: string;
}

const dayCount = (startIso: string, endIso: string) => {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
};

/**
 * The note for a period (both dates inclusive, YYYY-MM-DD). A settlement week is 7 days, so it carries exactly one weekly share.
 */
export function truckNoteForPeriod(trucks: NoteTruck[], startIso: string, endIso: string, recorded: RecordedPayment[] = []): TruckNote {
  const weeks = round2(dayCount(startIso, endIso) / 7);
  const units = unitsWithNote(trucks, endIso);

  const recordedTotal = round2(
    recorded
      .filter((e) => e.expense_type === 'Truck Payment' && (!e.expense_date || (e.expense_date >= startIso && e.expense_date <= endIso)))
      .reduce((s, e) => s + Math.max(0, num(e.amount)), 0),
  );
  if (recordedTotal > 0) {
    return { amount: recordedTotal, source: 'recorded', units: units.length, weeks, rule: 'Truck payments recorded as expenses in this period. The monthly allocation is not added on top.' };
  }

  if (units.length === 0) return { amount: 0, source: 'none', units: 0, weeks, rule: '' };

  const perWeek = round2(units.reduce((s, t) => s + weeklyNote(num(t.monthly_payment)), 0));
  const amount = round2(perWeek * weeks);
  const unitText = `${units.length} unit${units.length === 1 ? '' : 's'}`;
  const periodText = weeks === 1 ? 'a week' : `a week, ${weeks % 1 === 0 ? weeks : weeks.toFixed(1)} weeks here`;
  return { amount, source: 'allocated', units: units.length, weeks, rule: `Monthly note x 12 / 52 ${periodText} (${unitText}). The same every week.` };
}
