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
  expected_amount: number; // from fleet_loads.rate
  actual_amount: number;   // from statement
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

// Recurring expense types that should not be aggressively deduped
const RECURRING_EXPENSE_TYPES = new Set([
  'Licensing/Permits',
  'Card Fee',
  'Direct Deposit Fee',
  'CPP/Benefits',
  'LCN/Satellite',
  'Truck Warranty',
  'PrePass/Scale',
  'Trip Scanning',
  'Insurance',
]);

// Fallback advance detection patterns — only Pre-Trip patterns (contractor statement is authoritative)
const ADVANCE_FALLBACK_PATTERNS: RegExp[] = [
  /\bCARD\s*PRE-TRIP\b/i,
  /\bPRE-TRIP\b/i,
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

/**
 * Main reconciliation engine.
 * Takes parsed results from multiple documents and merges/deduplicates them.
 * Splits into 3 buckets: expenses, advances, credits.
 */
export function reconcileDocuments(
  stagedFiles: StagedFile[],
  loadsForRevenue: RevenueReconcileLoad[] = [],
): ReconciliationResult {
  const allExpenses: (ExtractedExpense & { source: string; sourceType: StagedFile['type'] })[] = [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let unitNumber: string | null = null;

  for (const sf of stagedFiles) {
    if (sf.status !== 'parsed' || !sf.data) continue;
    const sourceLabel = getFileTypeLabel(sf.type);

    // Track period and unit
    if (sf.data.period_start) {
      if (!periodStart || sf.data.period_start < periodStart) periodStart = sf.data.period_start;
    }
    if (sf.data.period_end) {
      if (!periodEnd || sf.data.period_end > periodEnd) periodEnd = sf.data.period_end;
    }
    if (sf.data.unit_number && !unitNumber) {
      unitNumber = sf.data.unit_number;
    }

    for (const exp of sf.data.expenses) {
      // Skip revenue lines from contractor PDFs
      if (sf.type === 'contractor_pdf' && !exp.is_reimbursement && !exp.is_advance && !exp.is_discount) {
        if (REVENUE_IGNORE_PATTERNS.some(p => p.test(exp.description))) continue;
        // Also skip positive amounts that aren't credits/advances/reimbursements
        if (exp.amount > 0) continue;
      }
      allExpenses.push({ ...exp, source: sourceLabel, sourceType: sf.type });
    }
  }

  // Fallback: apply advance detection for items missing the flag (e.g. from PDF sources)
  for (const item of allExpenses) {
    if (!item.is_advance && ADVANCE_FALLBACK_PATTERNS.some(p => p.test(item.description))) {
      item.is_advance = true;
    }
  }

  // Assign unique keys per source: same-source duplicates get counter suffixes
  const taggedExpenses: (typeof allExpenses[number] & { dedupKey: string })[] = [];
  const sourceGroups = new Map<string, typeof allExpenses>();
  for (const item of allExpenses) {
    const group = sourceGroups.get(item.source) || [];
    group.push(item);
    sourceGroups.set(item.source, group);
  }

  for (const [, items] of sourceGroups) {
    const counters = new Map<string, number>();
    for (const item of items) {
      const baseKey = `${item.date}_${item.expense_type}_${Math.abs(item.amount).toFixed(2)}`;
      const count = (counters.get(baseKey) || 0) + 1;
      counters.set(baseKey, count);
      // For recurring types, include source in key so cross-document items don't merge
      const sourceSegment = RECURRING_EXPENSE_TYPES.has(item.expense_type) ? `_${item.source}` : '';
      const dedupKey = `${baseKey}${sourceSegment}_${count}`;
      taggedExpenses.push({ ...item, dedupKey });
    }
  }

  // Deduplicate: only items with the exact same dedupKey merge (cross-document non-recurring)
  const deduped = new Map<string, ReconciledExpense>();

  for (const item of taggedExpenses) {
    const existing = deduped.get(item.dedupKey);

    if (existing) {
      if (!existing.sources.includes(item.source)) {
        existing.sources.push(item.source);
      }
      existing.merged = true;
      if (!existing.vendor && item.vendor) existing.vendor = item.vendor;
      if (!existing.gallons && item.gallons) existing.gallons = item.gallons;
      if (!existing.trip_number && item.trip_number) existing.trip_number = item.trip_number;
      if (!existing.description && item.description) existing.description = item.description;
    } else {
      deduped.set(item.dedupKey, {
        ...item,
        merged: false,
        sources: [item.source],
        selected: true,
      });
    }
  }

  // Pre-Trip pattern for advance qualification
  const PRE_TRIP_PATTERN = /\bPRE-TRIP\b/i;

  // Split into 3 buckets
  const expenses: ReconciledExpense[] = [];
  const advances: ReconciledExpense[] = [];
  const credits: ReconciledExpense[] = [];

  for (const item of deduped.values()) {
    if (item.is_advance) {
      // Only keep advances from contractor PDF that match Pre-Trip AND have a trip number
      const isContractor = (item as any).sourceType === 'contractor_pdf';
      const isPreTrip = PRE_TRIP_PATTERN.test(item.description);
      const hasTrip = !!item.trip_number;
      if (isContractor && isPreTrip && hasTrip) {
        advances.push(item);
      }
      // All other advances are dropped (duplicates of contractor statement)
    } else if (item.is_reimbursement || item.is_discount) {
      credits.push(item);
    } else {
      expenses.push(item);
    }
  }

  return {
    expenses,
    advances,
    credits,
    periodStart,
    periodEnd,
    unitNumber,
    revenue: { tripMismatches: [], period: null, hasBlockingDiscrepancy: false },
  };
}

// --------------------------------------------------------------------------
// Revenue reconciliation: flat-rate cross-check between statement & dispatch
// --------------------------------------------------------------------------

export interface RevenueReconcileLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  rate: number | null;
  delivery_date: string | null;
}

function normalizeTrip(value: string | null | undefined): string {
  return (value || '').replace(/[^0-9]/g, '').trim();
}

export function reconcileRevenue(
  stagedFiles: StagedFile[],
  loads: RevenueReconcileLoad[],
  periodStart: string | null,
  periodEnd: string | null,
): RevenueReconciliation {
  const tripMismatches: RevenueTripMismatch[] = [];

  // Aggregate parsed revenue across contractor PDFs by normalized trip number
  const revenueByTrip = new Map<string, { flat: number; description: string; raw: string }>();
  let unmatchedTotal = 0;

  for (const sf of stagedFiles) {
    if (sf.status !== 'parsed' || !sf.data || sf.type !== 'contractor_pdf') continue;
    const items = sf.data.revenue || [];
    for (const r of items) {
      const trip = normalizeTrip(r.trip_number);
      const amount = Number(r.flat_rate) || 0;
      if (!trip) {
        unmatchedTotal += amount;
        continue;
      }
      const existing = revenueByTrip.get(trip);
      if (existing) {
        existing.flat += amount;
      } else {
        revenueByTrip.set(trip, { flat: amount, description: r.description || '', raw: r.trip_number || trip });
      }
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
        actual_amount: parsed.flat,
        delta_amount: parsed.flat,
        reason: 'no_load_match',
      });
      unmatchedTotal += parsed.flat;
      continue;
    }
    const expected = Number(load.rate) || 0;
    const delta = parsed.flat - expected;
    if (Math.abs(delta) > TRIP_RATE_TOLERANCE) {
      tripMismatches.push({
        trip_number: trip,
        load_id: load.id,
        load_label: load.landstar_load_id || `${load.origin} → ${load.destination}`,
        expected_amount: expected,
        actual_amount: parsed.flat,
        delta_amount: delta,
        reason: 'rate_mismatch',
      });
    }
  }

  // Pass 2: period total fallback
  let period: RevenuePeriodCheck | null = null;
  if (periodStart && periodEnd) {
    const inWindow = loads.filter(l =>
      l.delivery_date && l.delivery_date >= periodStart && l.delivery_date <= periodEnd,
    );
    const expectedTotal = inWindow.reduce((s, l) => s + (Number(l.rate) || 0), 0);
    let actualTotal = 0;
    for (const v of revenueByTrip.values()) actualTotal += v.flat;
    actualTotal += unmatchedTotal;
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
