import { normalizeDescription, referenceId } from '@/lib/expense-matching';

/**
 * Finds expenses that look like the same charge filed twice, so they can be reviewed before they
 * skew a week. It only advises; nothing here changes data.
 *
 * Landstar repeats many charges legitimately: weekly insurance, and a scan fee or card fee every time
 * a document is scanned or the card is used, so the same small amount twice on one trip is normal. A
 * rule only fires when the evidence points at a re-import:
 *
 *   reference   Two rows carry the same transaction id (a card purchase "Ref-#", a direct deposit) and
 *               amount. Trip scan lines are not ids: each scanned document is its own charge.
 *   trip_total  One trip's card advances (or card or scan fees) split into two groups with the same
 *               total, added at different times. Exports sum a trip into one line and the statement
 *               itemizes it, so $1,900 shows up again as $1,500 + $400, or $3.50 as $1.75 + $1.75.
 *               Fees only count when one side is a summed line and the other is itemized: two single
 *               $1.75 card fees are two uses of the card, not a repeat.
 *   same_day    An identical one-off charge (fuel, a toll) on the same day, added at different times.
 *   repeat_fee  A scan or card fee that appears twice from one import, where one copy is dated the day
 *               it was imported. The importer uses that date for lines a file does not date, so the copy
 *               may be the same fee arriving from a second file. Often it is simply two scans or two
 *               card uses, so these are listed apart for review and never counted as likely duplicates.
 */

export interface DuplicateCheckExpense {
  id: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  description: string | null;
  load_id: string | null;
  created_at?: string | null;
}

export interface DuplicateGroup {
  key: string;
  kind: 'reference' | 'trip_total' | 'same_day' | 'repeat_fee';
  title: string;
  reason: string;
  rows: DuplicateCheckExpense[];
  /** The rows to remove if this is a duplicate: the ones added later. */
  suggestRemove: string[];
}

/** Rows added within this many minutes of each other came from the same upload. */
const SAME_UPLOAD_MINUTES = 3;
/** Subset search is exponential; a trip never has more than a handful of advances or card fees. */
const MAX_TRIP_ROWS = 12;
/** One import can run in several passes a few minutes apart. */
const SAME_IMPORT_MINUTES = 30;

const TRIP_TOTAL_TYPES = new Set(['Advance', 'Card Fee', 'Trip Scanning']);
/** Per-use fees: equal single rows on a trip are normal, so only a summed-versus-itemized split is suspicious. */
const PER_USE_FEE_TYPES = new Set(['Card Fee', 'Trip Scanning']);
/** Reference ids that name exactly one transaction. */
const TRANSACTION_ID_PREFIXES = ['REF', 'DD'];
/** One-off charges. Recurring weekly deductions (insurance, satellite, CPP) are never flagged. */
const ONE_OFF_TYPES = new Set(['Fuel', 'DEF', 'Fuel Discount', 'Tolls', 'Maintenance', 'Parking', 'Reimbursement']);

const cents = (v: number) => Math.round(Math.abs(Number(v) || 0) * 100);
const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = (e: DuplicateCheckExpense) => (e.created_at ? Date.parse(e.created_at) : Number.NaN);
const minutesApart = (a: number, b: number) => Math.abs(a - b) / 60_000;

const byAddedTime = (a: DuplicateCheckExpense, b: DuplicateCheckExpense) => (stamp(a) || 0) - (stamp(b) || 0);

export interface FindDuplicatesOptions {
  /** Trip number for a load id, for readable titles. */
  tripOf?: (loadId: string) => string | null | undefined;
}

export function findPossibleDuplicates(expenses: DuplicateCheckExpense[], options: FindDuplicatesOptions = {}): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();
  const claim = (rows: DuplicateCheckExpense[]) => rows.forEach((r) => claimed.add(r.id));
  const fresh = (rows: DuplicateCheckExpense[]) => rows.every((r) => !claimed.has(r.id));

  // --- reference: the same unique id and amount twice ---
  const byRef = new Map<string, DuplicateCheckExpense[]>();
  for (const e of expenses) {
    const ref = referenceId(e.description);
    if (!ref || !TRANSACTION_ID_PREFIXES.some((prefix) => ref.startsWith(prefix))) continue;
    const key = `${ref}|${e.expense_type}|${cents(e.amount)}`;
    byRef.set(key, [...(byRef.get(key) ?? []), e]);
  }
  for (const [key, rows] of byRef) {
    if (rows.length < 2) continue;
    const ordered = [...rows].sort(byAddedTime);
    groups.push({
      key: `reference:${key}`,
      kind: 'reference',
      title: `${ordered[0].expense_type} ${money(cents(ordered[0].amount))} filed ${ordered.length} times`,
      reason: `Each row carries the same reference number and amount (${ordered[0].description ?? ordered[0].expense_type}), so it is one charge filed twice.`,
      rows: ordered,
      suggestRemove: ordered.slice(1).map((r) => r.id),
    });
    claim(rows);
  }

  // --- trip_total: one trip's advances (or fees) split into two groups with the same total ---
  const byTrip = new Map<string, DuplicateCheckExpense[]>();
  for (const e of expenses) {
    if (!e.load_id || !TRIP_TOTAL_TYPES.has(e.expense_type) || Number.isNaN(stamp(e))) continue;
    const key = `${e.load_id}|${e.expense_type}`;
    byTrip.set(key, [...(byTrip.get(key) ?? []), e]);
  }
  for (const [key, rows] of byTrip) {
    if (rows.length < 2 || rows.length > MAX_TRIP_ROWS) continue;
    const ordered = [...rows].sort(byAddedTime);
    const total = ordered.reduce((s, r) => s + cents(r.amount), 0);
    if (total % 2 !== 0) continue;
    // The older upload is a prefix of the rows by time. Split where the gap between uploads opens.
    for (let split = 1; split < ordered.length; split++) {
      if (minutesApart(stamp(ordered[split - 1]), stamp(ordered[split])) <= SAME_UPLOAD_MINUTES) continue;
      const older = ordered.slice(0, split);
      const newer = ordered.slice(split);
      const olderTotal = older.reduce((s, r) => s + cents(r.amount), 0);
      const newerTotal = newer.reduce((s, r) => s + cents(r.amount), 0);
      if (olderTotal !== newerTotal || !fresh(ordered)) continue;
      const [loadId, type] = key.split('|');
      // Two equal single fees are two uses of the card or two scans. Only a summed line against
      // itemized lines (one row against two or more) looks like the same fees filed twice.
      if (PER_USE_FEE_TYPES.has(type) && older.length === newer.length) continue;
      const trip = options.tripOf?.(loadId);
      const itemized = (list: DuplicateCheckExpense[]) => (list.length > 1 ? ` (${list.map((r) => money(cents(r.amount))).join(' + ')})` : '');
      groups.push({
        key: `trip_total:${key}:${olderTotal}`,
        kind: 'trip_total',
        title: `${trip ? `Trip ${trip}` : 'One trip'} has ${type === 'Advance' ? 'card advances' : type === 'Card Fee' ? 'card fees' : 'scan fees'} of ${money(olderTotal)} twice`,
        reason: `${money(olderTotal)}${itemized(older)} and ${money(newerTotal)}${itemized(newer)} were added at different times. One upload sums a trip into a single line and another lists each charge.`,
        rows: ordered,
        suggestRemove: newer.map((r) => r.id),
      });
      claim(ordered);
      break;
    }
  }

  // --- same_day: an identical one-off charge on one day, added at different times ---
  const bySameDay = new Map<string, DuplicateCheckExpense[]>();
  for (const e of expenses) {
    if (e.load_id || !ONE_OFF_TYPES.has(e.expense_type) || referenceId(e.description) || Number.isNaN(stamp(e))) continue;
    const key = `${e.expense_date}|${e.expense_type}|${cents(e.amount)}|${normalizeDescription(e.description)}`;
    bySameDay.set(key, [...(bySameDay.get(key) ?? []), e]);
  }
  for (const [key, rows] of bySameDay) {
    if (rows.length < 2 || !fresh(rows)) continue;
    const ordered = [...rows].sort(byAddedTime);
    const spread = minutesApart(stamp(ordered[0]), stamp(ordered[ordered.length - 1]));
    if (spread <= SAME_UPLOAD_MINUTES) continue; // two on one statement are two charges
    groups.push({
      key: `same_day:${key}`,
      kind: 'same_day',
      title: `${ordered[0].expense_type} ${money(cents(ordered[0].amount))} on ${ordered[0].expense_date} twice`,
      reason: `Identical charge and description, added at different times.`,
      rows: ordered,
      suggestRemove: ordered.slice(1).map((r) => r.id),
    });
    claim(rows);
  }

  // --- repeat_fee: a per-use fee twice from one import, one copy dated the day it was imported ---
  const importDay = (e: DuplicateCheckExpense) => (e.created_at ?? '').slice(0, 10);
  const datedOnImportDay = (e: DuplicateCheckExpense) => {
    const day = importDay(e);
    if (!day) return false;
    return Math.abs(Date.parse(`${e.expense_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) <= 86_400_000;
  };
  const byFee = new Map<string, DuplicateCheckExpense[]>();
  for (const e of expenses) {
    if (!PER_USE_FEE_TYPES.has(e.expense_type) || Number.isNaN(stamp(e))) continue;
    // A scan names its trip; a card fee is only comparable within one trip.
    if (e.expense_type === 'Card Fee' && !e.load_id) continue;
    const key = `${e.expense_type}|${e.load_id ?? ''}|${cents(e.amount)}|${normalizeDescription(e.description)}`;
    byFee.set(key, [...(byFee.get(key) ?? []), e]);
  }
  for (const [key, rows] of byFee) {
    if (rows.length < 2 || !fresh(rows)) continue;
    const ordered = [...rows].sort(byAddedTime);
    if (minutesApart(stamp(ordered[0]), stamp(ordered[ordered.length - 1])) > SAME_IMPORT_MINUTES) continue;
    const importDated = ordered.filter(datedOnImportDay);
    const realDated = ordered.filter((r) => !datedOnImportDay(r));
    if (importDated.length === 0 || realDated.length === 0) continue;
    const copies = importDated.slice(0, realDated.length);
    const sample = ordered[0];
    const isScan = sample.expense_type === 'Trip Scanning';
    groups.push({
      key: `repeat_fee:${key}`,
      kind: 'repeat_fee',
      title: `${isScan ? 'Scan fee' : 'Card fee'} ${money(cents(sample.amount))} appears twice${isScan && sample.description ? ` for ${sample.description.replace(/^TRKSTP SCN\s*/i, '')}` : ''}`,
      reason: `Both were added in the same import and one is dated the day it was imported, which is what the importer does for a line its file does not date. It may be one fee arriving from two files, or two real ${isScan ? 'scans' : 'card uses'}: Landstar bills each one. Check the statement.`,
      rows: ordered,
      suggestRemove: copies.map((r) => r.id),
    });
    claim(rows);
  }

  return groups.sort((a, b) => (stamp(b.rows[b.rows.length - 1]) || 0) - (stamp(a.rows[a.rows.length - 1]) || 0));
}
