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

export interface ReconciledExpense extends ExtractedExpense {
  merged: boolean;
  sources: string[];
  selected: boolean;
}

export interface ReconciliationResult {
  expenses: ReconciledExpense[];
  advances: ReconciledExpense[];
  credits: ReconciledExpense[];
  periodStart: string | null;
  periodEnd: string | null;
  unitNumber: string | null;
}

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
  stagedFiles: StagedFile[]
): ReconciliationResult {
  const allExpenses: (ExtractedExpense & { source: string })[] = [];
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
      allExpenses.push({ ...exp, source: sourceLabel });
    }
  }

  // Deduplicate expenses by (date, expense_type, amount)
  const deduped = new Map<string, ReconciledExpense>();

  for (const item of allExpenses) {
    const key = `${item.date}_${item.expense_type}_${Math.abs(item.amount).toFixed(2)}`;
    const existing = deduped.get(key);

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
      deduped.set(key, {
        ...item,
        merged: false,
        sources: [item.source],
        selected: true,
      });
    }
  }

  // Split into 3 buckets
  const expenses: ReconciledExpense[] = [];
  const advances: ReconciledExpense[] = [];
  const credits: ReconciledExpense[] = [];

  for (const item of deduped.values()) {
    if (item.is_advance) {
      advances.push(item);
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
  };
}
