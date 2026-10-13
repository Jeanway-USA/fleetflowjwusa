import { classifyStatementLine } from '@/lib/expense-classifier';
import { isSameCharge, daysBetween } from '@/lib/expense-matching';

// Settlement Reconciliation Engine
// Cross-references and deduplicates expenses from multiple Landstar document types

export interface StagedFile {
  file: File;
  type: 'settlement_xlsx' | 'freight_bill_xlsx' | 'card_activity_pdf' | 'contractor_pdf' | 'unknown';
  status: 'pending' | 'parsed' | 'error';
  error?: string;
  data?: ParsedStatement;
}

export interface ParsedStatement {
  statement_type: 'card_activity' | 'contractor';
  period_start: string | null;
  period_end: string | null;
  unit_number: string | null;
  expenses: ExtractedExpense[];
  revenue?: ExtractedRevenue[];
}

export interface ExtractedExpense {
  date: string;
  expense_type: string;
  amount: number;
  trip_number: string | null;
  description: string;
  vendor: string | null;
  gallons: number | null;
  is_discount: boolean;
  is_reimbursement: boolean;
  is_advance: boolean;
}

export interface ExtractedRevenue {
  date: string | null;
  trip_number: string | null;
  flat_rate: number;
  reimbursement_total: number;
  description: string;
}

export interface ReconciledExpense extends ExtractedExpense {
  merged: boolean;
  sources: string[];
  selected: boolean;
}

export interface RevenueTripMismatch {
  trip_number: string;
  load_id: string | null;
  load_label: string | null;
  expected_amount: number;       // split-adjusted (truck's share)
  expected_gross_amount: number; // dispatch gross rate before split
  landstar_split: number;        // fraction applied (e.g. 0.65)
  actual_amount: number;         // from statement
  actual_source_label: string;   // e.g. 1099 revenue, truck revenue, flat rate
  delta_amount: number;
  reason: 'no_load_match' | 'rate_mismatch';
}

export interface RevenuePeriodCheck {
  expected_total: number; // Σ fleet_loads.rate in period
  actual_total: number;   // Σ statement flat_rate
  delta: number;
  exceedsTolerance: boolean;
}

export interface RevenueReconciliation {
  tripMismatches: RevenueTripMismatch[];
  period: RevenuePeriodCheck | null;
  hasBlockingDiscrepancy: boolean;
}

export interface ReconciliationResult {
  expenses: ReconciledExpense[];
  advances: ReconciledExpense[];
  credits: ReconciledExpense[];
  periodStart: string | null;
  periodEnd: string | null;
  unitNumber: string | null;
  revenue: RevenueReconciliation;
  /**
   * Set when some lines had no date of their own: 'statement' = dated with the
   * uploaded statement's period end; 'latest_week' = no document carried a date,
   * so the most recent Wednesday (Landstar period end) was assumed.
   */
  datesInferred: 'statement' | 'latest_week' | null;
  /** Contractor PDF vs XLSX line check; null when both weren't uploaded. */
  crossCheck: { addedFromXlsx: number; mismatches: CrossCheckMismatch[] } | null;
}

// Tolerances for revenue reconciliation
export const TRIP_RATE_TOLERANCE = 1.0;   // $1.00 per trip
export const PERIOD_TOTAL_TOLERANCE = 5.0; // $5.00 per pay cycle

const FILE_TYPE_LABELS: Record<StagedFile['type'], string> = {
  settlement_xlsx: 'Settlement Details XLSX',
  freight_bill_xlsx: 'Freight Bill Details XLSX',
  card_activity_pdf: 'Card Activity PDF',
  contractor_pdf: 'Contractor Statement PDF',
  unknown: 'Unknown',
};

export function getFileTypeLabel(type: StagedFile['type']): string {
  return FILE_TYPE_LABELS[type] || 'Unknown';
}

// Revenue patterns to ignore from contractor PDFs
const REVENUE_IGNORE_PATTERNS: RegExp[] = [
  /\bTRACTOR\s*L\/H\b/i,
  /\bLINE\s*HAUL\b/i,
  /\b1099\s*REVENUE\b/i,
  /\bLINEHAUL\b/i,
  /\bTRACTOR\s*LEASE\b/i,
];

// Fallback advance detection patterns — only Pre-Trip patterns (contractor statement is authoritative)
const ADVANCE_FALLBACK_PATTERNS: RegExp[] = [
  /\bCARD\s*PRE-TRIP\b/i,
  /\bPRE-TRIP\b/i,
  /\bPARTIAL\s*FINAL\s*S(ETT|T)\b/i,
];

/**
 * Detect document type from filename patterns
 */
export function detectFileType(file: File): StagedFile['type'] {
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf');
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

  if (isExcel) {
    if (/freight\s*bill/i.test(name) || /fb\s*detail/i.test(name)) {
      return 'freight_bill_xlsx';
    }
    if (/settlement/i.test(name) || /stl\s*detail/i.test(name)) {
      return 'settlement_xlsx';
    }
    if (/freight/i.test(name)) return 'freight_bill_xlsx';
    return 'settlement_xlsx';
  }

  if (isPdf) {
    if (/card\s*activity/i.test(name) || /card_activity/i.test(name)) {
      return 'card_activity_pdf';
    }
    if (/contractor/i.test(name) || /bco/i.test(name) || /statement/i.test(name)) {
      return 'contractor_pdf';
    }
    return 'contractor_pdf';
  }

  return 'unknown';
}

/** True when a PDF's filename says which statement it is, so a same-type file can safely replace it. */
function pdfNameSaysType(name: string): boolean {
  return /card[s_-]*activity|contractor|bco|statement/i.test(name);
}

/**
 * Add newly chosen files to the staged list. A file replaces an earlier file of the same
 * detected type, except PDFs whose names do not say what they are (Landstar's downloads are
 * named like Batch#DO0000014J): both would be guessed as the same type and the second would
 * silently replace the first. Their real type is read from the parsed statement.
 */
export function mergeStagedFiles(prev: StagedFile[], added: StagedFile[]): StagedFile[] {
  const updated = [...prev];
  for (const ns of added) {
    const ambiguousPdf = ns.file.name.toLowerCase().endsWith('.pdf') && !pdfNameSaysType(ns.file.name);
    const existingIdx = updated.findIndex((s) =>
      ambiguousPdf ? s.file.name === ns.file.name : s.type === ns.type,
    );
    if (existingIdx >= 0) updated[existingIdx] = ns;
    else updated.push(ns);
  }
  return updated;
}

/** What the parser says a PDF is, which beats guessing from its filename. */
export function typeFromParsedPdf(statementType: unknown, guessed: StagedFile['type']): StagedFile['type'] {
  if (statementType === 'card_activity') return 'card_activity_pdf';
  if (statementType === 'contractor') return 'contractor_pdf';
  return guessed;
}

/**
 * Main reconciliation engine.
 * Takes parsed results from multiple documents and merges/deduplicates them.
 * Splits into 3 buckets: expenses, advances, credits.
 */
export function reconcileDocuments(
  stagedFiles: StagedFile[],
  loadsForRevenue: RevenueReconcileLoad[] = [],
  landstarSplit: number = 0.65,
  today: Date = new Date(),
): ReconciliationResult {
  type SourcedExpense = ExtractedExpense & { source: string; sourceType: StagedFile['type'] };
  const allExpenses: SourcedExpense[] = [];
  const xlsxLines: SourcedExpense[] = [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let unitNumber: string | null = null;

  const parsedFiles = stagedFiles.filter((sf) => sf.status === 'parsed' && sf.data);
  // The contractor statement PDF itemizes every settlement charge with its date
  // and installment balance. The Settlement/Freight Bill XLSX exports list the
  // same charges summed per description/trip and (Settlement Details) undated,
  // so when the PDF is present it is the source of truth and the XLSX lines are
  // used only to cross-check it.
  const hasContractorPdf = parsedFiles.some((sf) => sf.type === 'contractor_pdf');

  for (const sf of parsedFiles) {
    const data = sf.data!;
    const sourceLabel = getFileTypeLabel(sf.type);

    // Track period and unit
    if (data.period_start) {
      if (!periodStart || data.period_start < periodStart) periodStart = data.period_start;
    }
    if (data.period_end) {
      if (!periodEnd || data.period_end > periodEnd) periodEnd = data.period_end;
    }
    if (data.unit_number && !unitNumber) {
      unitNumber = data.unit_number;
    }

    const isXlsx = sf.type === 'settlement_xlsx' || sf.type === 'freight_bill_xlsx';
    for (const exp of data.expenses) {
      if (sf.type === 'contractor_pdf' && !isContractorCharge(exp)) continue;
      // The parser files card scale tickets under Misc; they are scale charges like PrePass.
      // Revised-bill reversals and statement totals are not costs; other known lines get their real type.
      const verdict = classifyStatementLine(exp.description);
      if (verdict?.action === 'skip') continue;
      let expense_type = exp.expense_type === 'Misc' && /\bcat\s*scale\b/i.test(exp.description) ? 'PrePass/Scale' : exp.expense_type;
      let is_advance = exp.is_advance;
      let is_reimbursement = exp.is_reimbursement;
      if (verdict?.action === 'retype' && (!expense_type || expense_type === 'Misc')) {
        expense_type = verdict.toType;
        if (verdict.group === 'advance') is_advance = true;
        if (verdict.group === 'credit') is_reimbursement = true;
      }
      const line = { ...exp, expense_type, is_advance, is_reimbursement, source: sourceLabel, sourceType: sf.type };
      if (isXlsx && hasContractorPdf) xlsxLines.push(line);
      else allExpenses.push(line);
    }
  }

  // Landstar settles weekly (periods end on Wednesday). The PDF parser sometimes
  // reports the whole month as the period, which would drag a month of loads into
  // the revenue check, so clamp to one week.
  if (periodEnd && (!periodStart || daysBetween(periodStart, periodEnd) > 7)) {
    periodStart = addDays(periodEnd, -6);
  }

  // Undated lines (Settlement Details "Latest Week" exports) take the statement's
  // period end, or the most recent Wednesday when nothing else in the upload has a
  // date. Never the upload day — that scattered old charges onto import dates.
  let datesInferred: ReconciliationResult['datesInferred'] = null;
  const fallbackDate = periodEnd ?? latestSettlementWednesday(today);
  for (const item of [...allExpenses, ...xlsxLines]) {
    if (!item.date) {
      item.date = fallbackDate;
      datesInferred = periodEnd ? 'statement' : 'latest_week';
    }
  }
  if (!periodEnd && datesInferred) {
    periodEnd = fallbackDate;
    periodStart = addDays(fallbackDate, -6);
  }

  // Line-by-line cross-check of the PDF against the XLSX exports. XLSX lines the
  // PDF parser missed are added (so nothing is lost); amount disagreements are
  // surfaced for review.
  const crossCheck = hasContractorPdf && xlsxLines.length > 0
    ? crossCheckStatement(allExpenses.filter((e) => e.sourceType === 'contractor_pdf'), xlsxLines)
    : null;
  if (crossCheck) {
    for (const missing of crossCheck.missingFromPdf) allExpenses.push(missing as SourcedExpense);
    // Where the PDF read disagrees with the spreadsheet, the spreadsheet's amount is used.
    for (const swap of crossCheck.replaced) {
      for (const line of swap.remove) {
        const at = allExpenses.indexOf(line as unknown as SourcedExpense);
        if (at >= 0) allExpenses.splice(at, 1);
      }
      allExpenses.push(swap.add as unknown as SourcedExpense);
    }
  }

  // Fallback: apply advance detection for items missing the flag (e.g. from PDF sources)
  for (const item of allExpenses) {
    if (!item.is_advance && ADVANCE_FALLBACK_PATTERNS.some(p => p.test(item.description))) {
      item.is_advance = true;
    }
  }

  // Cross-document merge for uploads without a contractor PDF (e.g. both XLSX
  // exports, which repeat per-trip charges). Each merged line absorbs at most one
  // line per other source, so repeated charges within one document (weekly
  // installments, several card fees in a day) are never collapsed.
  const deduped: ReconciledExpense[] = [];

  for (const item of allExpenses) {
    let best: ReconciledExpense | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const candidate of deduped) {
      if (candidate.sources.includes(item.source) || !isSameCharge(candidate, item)) continue;
      const gap = daysBetween(candidate.date, item.date);
      if (gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }

    if (best) {
      best.sources.push(item.source);
      best.merged = true;
      if (!best.vendor && item.vendor) best.vendor = item.vendor;
      if (!best.gallons && item.gallons) best.gallons = item.gallons;
      if (!best.trip_number && item.trip_number) best.trip_number = item.trip_number;
      if (!best.description && item.description) best.description = item.description;
    } else {
      deduped.push({
        ...item,
        merged: false,
        sources: [item.source],
        selected: true,
      });
    }
  }

  // Trip advances: card pre-trips and "partial final settlement" loads. These are
  // the money Landstar fronted against a trip; card-activity cash advances and
  // deposits are spending of that same money, so they are not counted again.
  const TRIP_ADVANCE_PATTERN = /\b(PRE-TRIP|PARTIAL\s*FINAL\s*S(ETT|T))\b/i;
  const advanceSources = hasContractorPdf
    ? [FILE_TYPE_LABELS.contractor_pdf]
    : [FILE_TYPE_LABELS.settlement_xlsx, FILE_TYPE_LABELS.freight_bill_xlsx];

  // Split into 3 buckets
  const expenses: ReconciledExpense[] = [];
  const advances: ReconciledExpense[] = [];
  const credits: ReconciledExpense[] = [];

  for (const item of deduped) {
    if (item.is_advance) {
      // Merged lines keep the first source's type, so check every contributing source.
      const fromStatement = item.sources.some((s) => advanceSources.includes(s));
      if (fromStatement && TRIP_ADVANCE_PATTERN.test(item.description) && item.trip_number) {
        advances.push(item);
      }
    } else if (item.is_reimbursement || item.is_discount) {
      credits.push(item);
    } else {
      expenses.push(item);
    }
  }

  const revenue = reconcileRevenue(stagedFiles, loadsForRevenue, periodStart, periodEnd, landstarSplit);

  return {
    expenses,
    advances,
    credits,
    periodStart,
    periodEnd,
    unitNumber,
    revenue,
    datesInferred,
    crossCheck: crossCheck
      ? { addedFromXlsx: crossCheck.missingFromPdf.length, mismatches: crossCheck.mismatches }
      : null,
  };
}

// --------------------------------------------------------------------------
// Statement helpers
// --------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  const d = new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** Most recent Wednesday on or before `today` (local calendar), as YYYY-MM-DD. */
export function latestSettlementWednesday(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const back = (d.getDay() - 3 + 7) % 7; // 3 = Wednesday
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Trip-level lines on a contractor statement that are charges (vs. revenue,
// accessorial pay, or their reversals such as "Just In Time" or "Update Detention").
const TRIP_CHARGE_PATTERN = /\b(CARD|FEE|TRKSTP|SCN|PRE-TRIP|PARTIAL|ADV|ADVANCE|FUEL\s+PURCHASE|DEF|TOLL|SCALE|PERMIT|LUMPER|CHARGE|DEDUCT|ESCROW)\b/i;
const CONTRACTOR_REVENUE_PATTERNS: RegExp[] = [
  ...REVENUE_IGNORE_PATTERNS,
  /\bFUEL\s*SURCHARGE\b/i,
  /\bTRIP%?\s*ESCROW\b/i,
];

/**
 * Which contractor-PDF lines are costs. The statement lists deductions as
 * positive amounts in the "Deductions & Charges" column, so sign can't be used;
 * instead drop revenue descriptions, and on trip lines keep only recognizable
 * charges (accessorial revenue like "Just In Time" also carries a trip number).
 */
function isContractorCharge(exp: ExtractedExpense): boolean {
  if (exp.is_reimbursement || exp.is_discount || exp.is_advance) return true;
  if (CONTRACTOR_REVENUE_PATTERNS.some((p) => p.test(exp.description))) return false;
  if (exp.trip_number && (!exp.expense_type || exp.expense_type === 'Misc')) {
    return TRIP_CHARGE_PATTERN.test(exp.description);
  }
  return true;
}

export interface CrossCheckMismatch {
  description: string;
  trip_number: string | null;
  xlsxAmount: number;
  pdfAmount: number;
}

/**
 * Compare itemized contractor-PDF lines against XLSX lines, which Landstar sums
 * per description + trip (e.g. two warranty plans 75.47 + 12.47 = 87.94).
 */
function crossCheckStatement<T extends ExtractedExpense>(pdfLines: T[], xlsxLines: T[]) {
  const claimed = new Set<number>();
  const missingFromPdf: T[] = [];
  const mismatches: CrossCheckMismatch[] = [];
  const replaced: Array<{ remove: T[]; add: T }> = [];
  const cents = (v: number) => Math.round(Math.abs(v) * 100);
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const trip = (t: string | null) => (t ?? '').replace(/\D/g, '');

  // Settlement Details and Freight Bill repeat per-trip charges; check each charge once.
  const seen = new Set<string>();
  const uniqueXlsx = xlsxLines.filter((l) => {
    const key = `${norm(l.description)}|${trip(l.trip_number)}|${cents(l.amount)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const x of uniqueXlsx) {
    const xDesc = norm(x.description);
    const group = pdfLines
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => {
        if (claimed.has(i)) return false;
        if (trip(x.trip_number) && trip(p.trip_number) && trip(x.trip_number) !== trip(p.trip_number)) return false;
        const pDesc = norm(p.description);
        return ` ${pDesc} `.includes(` ${xDesc} `) || ` ${xDesc} `.includes(` ${pDesc} `);
      });

    if (group.length === 0) {
      // Fall back to a same-trip, same-amount line under different wording.
      const i = pdfLines.findIndex((p, idx) =>
        !claimed.has(idx) && cents(p.amount) === cents(x.amount) && trip(p.trip_number) === trip(x.trip_number));
      if (i >= 0) claimed.add(i);
      else missingFromPdf.push(x);
      continue;
    }

    // The spreadsheet sums a description per day (a toll agency's lines for one date) while the PDF
    // read may not carry the date, so look for the PDF lines that add up to the spreadsheet's amount.
    const exact = findSubsetSum(group.map(({ p }) => cents(p.amount)), cents(x.amount));
    if (exact) {
      exact.forEach((k) => claimed.add(group[k].i));
      continue;
    }

    // No lines add up: the PDF read has a wrong digit somewhere. The spreadsheet is structured data,
    // so its amount wins and replaces those PDF lines.
    const sum = group.reduce((s, { p }) => s + cents(p.amount), 0);
    group.forEach(({ i }) => claimed.add(i));
    mismatches.push({
      description: x.description,
      trip_number: x.trip_number,
      xlsxAmount: cents(x.amount) / 100,
      pdfAmount: sum / 100,
    });
    replaced.push({ remove: group.map(({ p }) => p), add: { ...group[0].p, description: x.description, amount: Math.abs(x.amount) } });
  }

  return { missingFromPdf, mismatches, replaced };
}

/** Indexes of some subset of `amounts` (in cents) that adds up to `target`, or null. Small inputs only. */
function findSubsetSum(amounts: number[], target: number): number[] | null {
  if (amounts.length === 0 || amounts.length > 16) return null;
  const pick: number[] = [];
  const search = (from: number, remaining: number): boolean => {
    if (remaining === 0) return pick.length > 0;
    if (remaining < 0) return false;
    for (let k = from; k < amounts.length; k++) {
      pick.push(k);
      if (search(k + 1, remaining - amounts[k])) return true;
      pick.pop();
    }
    return false;
  };
  return search(0, target) ? [...pick] : null;
}

// --------------------------------------------------------------------------
// Revenue reconciliation: flat-rate cross-check between statement & dispatch
// --------------------------------------------------------------------------

export interface RevenueReconcileLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  rate?: number | null;
  /** Your revenue on the load, compared with what Landstar settled when a Freight Bill Details file is uploaded. */
  net_revenue?: number | null;
  delivery_date?: string | null;
}

function normalizeTrip(value: string | null | undefined): string {
  return (value || '').replace(/[^0-9]/g, '').trim();
}

type RevenueSourceKind = '1099_revenue' | 'truck_revenue' | 'gross_linehaul' | 'flat_rate';

interface NormalizedStatementRevenue {
  flat: number;
  description: string;
  raw: string;
  sourceKind: RevenueSourceKind;
}

const REVENUE_SOURCE_LABELS: Record<RevenueSourceKind, string> = {
  '1099_revenue': '1099 revenue',
  truck_revenue: 'truck revenue',
  gross_linehaul: 'linehaul/flat rate',
  flat_rate: 'statement flat rate',
};

function classifyRevenueSource(description: string): { kind: RevenueSourceKind; priority: number } {
  const desc = description || '';
  if (/\b1099\s*REVENUE\b/i.test(desc)) {
    return { kind: '1099_revenue', priority: 3 };
  }
  if (/\b(TRUCK|TRACTOR|BCO|CONTRACTOR|NET)\b.*\b(REVENUE|PAY|EARNINGS)\b/i.test(desc)
    || /\b(REVENUE|PAY|EARNINGS)\b.*\b(TRUCK|TRACTOR|BCO|CONTRACTOR|NET)\b/i.test(desc)) {
    return { kind: 'truck_revenue', priority: 2 };
  }
  if (/\b(TRACTOR\s*L\/H|LINE\s*HAUL|LINEHAUL|FLAT\s*RATE|TRIP\s*RATE)\b/i.test(desc)) {
    return { kind: 'gross_linehaul', priority: 1 };
  }
  return { kind: 'flat_rate', priority: 0 };
}

function normalizeStatementRevenue(rows: ExtractedRevenue[]): NormalizedStatementRevenue | null {
  if (rows.length === 0) return null;

  const ranked = rows
    .map((row) => ({ row, ...classifyRevenueSource(row.description) }))
    .filter(({ row }) => Number.isFinite(Number(row.flat_rate)) && Number(row.flat_rate) !== 0)
    .sort((a, b) => b.priority - a.priority || Math.abs(Number(b.row.flat_rate)) - Math.abs(Number(a.row.flat_rate)));

  if (ranked.length === 0) return null;

  const selected = ranked[0];
  return {
    flat: Math.round(Math.abs(Number(selected.row.flat_rate)) * 100) / 100,
    description: selected.row.description || '',
    raw: selected.row.trip_number || normalizeTrip(selected.row.trip_number) || '',
    sourceKind: selected.kind,
  };
}

export function reconcileRevenue(
  stagedFiles: StagedFile[],
  loads: RevenueReconcileLoad[],
  periodStart: string | null,
  periodEnd: string | null,
  landstarSplit: number = 0.65,
): RevenueReconciliation {
  const tripMismatches: RevenueTripMismatch[] = [];

  // A Freight Bill Details export lists what Landstar settled for each trip as structured lines, so it is
  // the reliable statement figure; the PDF read can drop digits. When it is uploaded, each trip's settled
  // revenue is compared with the revenue on the load, and the PDF's revenue is not used.
  const settledByTrip = new Map<string, number>();
  for (const sf of stagedFiles) {
    if (sf.status !== 'parsed' || !sf.data || sf.type !== 'freight_bill_xlsx') continue;
    for (const r of sf.data.revenue || []) settledByTrip.set(normalizeTrip(r.trip_number), Number(r.flat_rate) || 0);
  }
  if (settledByTrip.size > 0) {
    let expectedTotal = 0;
    let actualTotal = 0;
    for (const [trip, settled] of settledByTrip) {
      const load = loads.find((l) => normalizeTrip(l.landstar_load_id) === trip);
      actualTotal += settled;
      if (!load) {
        tripMismatches.push({ trip_number: trip, load_id: null, load_label: null, expected_amount: 0, expected_gross_amount: 0, landstar_split: 1, actual_amount: settled, actual_source_label: 'Freight Bill Details', delta_amount: settled, reason: 'no_load_match' });
        continue;
      }
      const mine = Math.round((Number(load.net_revenue) || 0) * 100) / 100;
      expectedTotal += mine;
      const delta = settled - mine;
      if (Math.abs(delta) > 0.01) {
        tripMismatches.push({ trip_number: trip, load_id: load.id, load_label: load.landstar_load_id || `${load.origin} → ${load.destination}`, expected_amount: mine, expected_gross_amount: 0, landstar_split: 1, actual_amount: settled, actual_source_label: 'Freight Bill Details', delta_amount: delta, reason: 'rate_mismatch' });
      }
    }
    const delta = actualTotal - expectedTotal;
    const period: RevenuePeriodCheck = { expected_total: expectedTotal, actual_total: actualTotal, delta, exceedsTolerance: Math.abs(delta) > 0.01 };
    return { tripMismatches, period, hasBlockingDiscrepancy: tripMismatches.length > 0 || period.exceedsTolerance };
  }

  // Normalise split to fraction in case a caller passes 65 instead of 0.65
  const splitFraction = landstarSplit > 1 ? landstarSplit / 100 : landstarSplit;
  const applySplit = (gross: number) => Math.round(gross * splitFraction * 100) / 100;

  // Normalize parsed revenue across contractor PDFs by normalized trip number.
  // Contractor statements may expose both gross linehaul and final 1099 revenue
  // for the same trip. Reconciliation must compare dispatch truck-share against
  // the final 1099/truck revenue, not sum every visible revenue-looking row.
  const revenueRowsByTrip = new Map<string, ExtractedRevenue[]>();
  let revenueWithoutTripTotal = 0;

  for (const sf of stagedFiles) {
    if (sf.status !== 'parsed' || !sf.data || sf.type !== 'contractor_pdf') continue;
    const items = sf.data.revenue || [];
    for (const r of items) {
      const trip = normalizeTrip(r.trip_number);
      const amount = Number(r.flat_rate) || 0;
      if (!trip) {
        revenueWithoutTripTotal += Math.abs(amount);
        continue;
      }
      const existing = revenueRowsByTrip.get(trip) || [];
      existing.push(r);
      revenueRowsByTrip.set(trip, existing);
    }
  }

  const revenueByTrip = new Map<string, NormalizedStatementRevenue>();
  for (const [trip, rows] of revenueRowsByTrip) {
    const normalized = normalizeStatementRevenue(rows);
    if (normalized) {
      revenueByTrip.set(trip, {
        ...normalized,
        raw: normalized.raw || rows[0]?.trip_number || trip,
      });
    }
  }

  // Pass 1: per-trip match against fleet_loads
  for (const [trip, parsed] of revenueByTrip) {
    const load = loads.find(l => normalizeTrip(l.landstar_load_id) === trip);
    if (!load) {
      tripMismatches.push({
        trip_number: trip,
        load_id: null,
        load_label: null,
        expected_amount: 0,
        expected_gross_amount: 0,
        landstar_split: splitFraction,
        actual_amount: parsed.flat,
        actual_source_label: REVENUE_SOURCE_LABELS[parsed.sourceKind],
        delta_amount: parsed.flat,
        reason: 'no_load_match',
      });
      continue;
    }
    const gross = Number(load.rate) || 0;
    const expected = applySplit(gross);
    const delta = parsed.flat - expected;
    if (Math.abs(delta) > TRIP_RATE_TOLERANCE) {
      tripMismatches.push({
        trip_number: trip,
        load_id: load.id,
        load_label: load.landstar_load_id || `${load.origin} → ${load.destination}`,
        expected_amount: expected,
        expected_gross_amount: gross,
        landstar_split: splitFraction,
        actual_amount: parsed.flat,
        actual_source_label: REVENUE_SOURCE_LABELS[parsed.sourceKind],
        delta_amount: delta,
        reason: 'rate_mismatch',
      });
    }
  }

  // Pass 2: period total fallback. Only meaningful when the upload carries statement revenue;
  // an export with no revenue lines (Freight Bill Details, a year-to-date Settlement Details)
  // has nothing to compare, and a zero statement total would be a false discrepancy.
  const hasStatementRevenue = revenueByTrip.size > 0 || revenueWithoutTripTotal > 0;
  let period: RevenuePeriodCheck | null = null;
  if (periodStart && periodEnd && hasStatementRevenue) {
    // A load belongs to this statement if Landstar paid it here (its trip number is
    // on the statement) or it delivered inside the window. Using the window alone
    // flags false discrepancies for loads delivered just before/after the period.
    const inWindow = loads.filter(l =>
      revenueByTrip.has(normalizeTrip(l.landstar_load_id))
      || (l.delivery_date && l.delivery_date >= periodStart && l.delivery_date <= periodEnd),
    );
    const expectedGrossTotal = inWindow.reduce((s, l) => s + (Number(l.rate) || 0), 0);
    const expectedTotal = applySplit(expectedGrossTotal);
    let actualTotal = 0;
    for (const v of revenueByTrip.values()) actualTotal += v.flat;
    actualTotal += revenueWithoutTripTotal;
    const delta = actualTotal - expectedTotal;
    period = {
      expected_total: expectedTotal,
      actual_total: actualTotal,
      delta,
      exceedsTolerance: Math.abs(delta) > PERIOD_TOTAL_TOLERANCE,
    };
  }

  const hasBlockingDiscrepancy = tripMismatches.length > 0 || (period?.exceedsTolerance ?? false);
  return { tripMismatches, period, hasBlockingDiscrepancy };
}
