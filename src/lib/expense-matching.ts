/**
 * Decides whether two Landstar expense lines are the same charge.
 *
 * Landstar repeats many deductions every settlement week (insurance, warranty,
 * CPP, and big purchases it finances and collects in weekly installments), so
 * "same description + same amount" is NOT enough to call something a duplicate.
 * At the same time the same charge can arrive with dates a day apart (the
 * settlement XLSX uses the settlement date; the PDF parser sometimes picks the
 * statement date), so exact-date matching lets real duplicates through.
 *
 * Rules, by line kind:
 *   reference     – description carries a unique id (e.g. "TRKSTP SCN BLB 7181498").
 *                   Same id + amount is the same charge whatever the date.
 *   transaction   – fuel, DEF, card fees, tolls, scans, deposit fees. These carry
 *                   real transaction dates and can legitimately repeat several
 *                   times a day, so they match only on the exact date.
 *   deduction     – everything else: weekly settlement deductions and installments.
 *                   Same charge only within ±DEDUCTION_WINDOW_DAYS (one pay week);
 *                   next week's installment, 7 days later, is always new.
 *
 * Matching is one-to-one: each existing row can absorb at most one incoming line,
 * so two identical installments on one statement never collapse into one.
 */

export interface MatchableExpense {
  date: string | null;          // YYYY-MM-DD
  expense_type: string | null;
  amount: number;
  description?: string | null;
  trip_number?: string | null;
}

export type ExpenseLineKind = 'reference' | 'transaction' | 'deduction';

export const DEDUCTION_WINDOW_DAYS = 3;
export const REFERENCE_WINDOW_DAYS = 120;

const TRANSACTION_TYPES = new Set([
  'Fuel',
  'Fuel Discount',
  'DEF',
  'Card Fee',
  'Direct Deposit Fee',
  'Tolls',
  'Trip Scanning',
  'Advance',
]);

// "PrePass/Scale" mixes the weekly PREPASS deduction with one-off CAT scale tickets.
const TRANSACTION_DESCRIPTION = /\b(SCALE|TOLL|TOLLS)\b/;

export function normalizeDescription(desc: string | null | undefined): string {
  return (desc ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Transaction ids that identify exactly one charge: card "Ref-#########" numbers,
 * direct-deposit "DD# #######" numbers, and trip scans (one per trip).
 * Bare trip numbers are NOT unique — a trip can carry several card fees.
 */
const REFERENCE_PATTERNS: Array<[RegExp, string]> = [
  [/\bREF\s*(\d{6,})\b/, 'REF'],
  [/\bDD\s+(\d{6,})\b/, 'DD'],
  [/\bTRKSTP\s+SCN\s+[A-Z0-9]{3}\s+(\d{6,})\b/, 'SCN'],
];

export function referenceId(desc: string | null | undefined): string | null {
  const norm = normalizeDescription(desc);
  for (const [pattern, prefix] of REFERENCE_PATTERNS) {
    const m = norm.match(pattern);
    if (m) return `${prefix}${m[1]}`;
  }
  return null;
}

/**
 * Descriptions match when equal, or when one contains the other on word
 * boundaries — the PDF parser prefixes lines ("CQQ 1121039 CARD FEE",
 * "WEEKLY DEDUCTIONS C36944-01-IW-1199") that the XLSX lists bare.
 */
function descriptionsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

const normTrip = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');

export function lineKind(e: MatchableExpense): ExpenseLineKind {
  if (referenceId(e.description)) return 'reference';
  if (e.expense_type && TRANSACTION_TYPES.has(e.expense_type)) return 'transaction';
  if (TRANSACTION_DESCRIPTION.test(normalizeDescription(e.description))) return 'transaction';
  return 'deduction';
}

const cents = (v: number) => Math.round(Math.abs(Number(v) || 0) * 100);

export function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Same charge? Order of arguments doesn't matter. */
export function isSameCharge(a: MatchableExpense, b: MatchableExpense): boolean {
  if (cents(a.amount) !== cents(b.amount)) return false;

  // Charges on two different trips are never the same charge.
  const tripA = normTrip(a.trip_number);
  const tripB = normTrip(b.trip_number);
  if (tripA && tripB && tripA !== tripB) return false;

  const refA = referenceId(a.description);
  const refB = referenceId(b.description);
  if (refA && refB) {
    return refA === refB && daysBetween(a.date, b.date) <= REFERENCE_WINDOW_DAYS;
  }

  // Prefer descriptions; fall back to type only when one side has no description.
  const descA = normalizeDescription(a.description);
  const descB = normalizeDescription(b.description);
  const sameIdentity = descA && descB ? descriptionsMatch(descA, descB) : a.expense_type === b.expense_type;
  if (!sameIdentity) return false;

  const window = lineKind(a) === 'transaction' || lineKind(b) === 'transaction' ? 0 : DEDUCTION_WINDOW_DAYS;
  return daysBetween(a.date, b.date) <= window;
}

/**
 * One-to-one matching of incoming lines against candidates.
 * Returns, for each incoming index, the index of the matched candidate or -1.
 * Closest date wins when several candidates qualify.
 */
export function matchOneToOne(
  incoming: MatchableExpense[],
  candidates: MatchableExpense[],
): number[] {
  const used = new Set<number>();
  return incoming.map((item) => {
    let best = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    candidates.forEach((c, i) => {
      if (used.has(i) || !isSameCharge(item, c)) return;
      const gap = daysBetween(item.date, c.date);
      if (gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best >= 0) used.add(best);
    return best;
  });
}
