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
}

export interface ReconciledExpense extends ExtractedExpense {
  merged: boolean;
  sources: string[];
  selected: boolean;
}

export interface ReconciledEarning {
  date: string;
  description: string;
  amount: number;
  trip_number: string | null;
  sources: string[];
}

export interface ReconciliationResult {
  earnings: ReconciledEarning[];
  expenses: ReconciledExpense[];
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
    // Default: if it has "freight" it's freight bill, otherwise settlement
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
    // Default PDF → contractor
    return 'contractor_pdf';
  }

  return 'unknown';
}

/**
 * Main reconciliation engine.
 * Takes parsed results from multiple documents and merges/deduplicates them.
 */
export function reconcileDocuments(
  stagedFiles: StagedFile[]
): ReconciliationResult {
  const allExpenses: (ExtractedExpense & { source: string })[] = [];
  const allEarnings: ReconciledEarning[] = [];
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
      // Revenue rows from contractor PDF (positive, non-reimbursement) → earnings
      if (sf.type === 'contractor_pdf' && exp.amount > 0 && !exp.is_reimbursement) {
        allEarnings.push({
          date: exp.date,
          description: exp.description,
          amount: exp.amount,
          trip_number: exp.trip_number,
          sources: [sourceLabel],
        });
        continue;
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
      // Merge: add source, mark as merged
      if (!existing.sources.includes(item.source)) {
        existing.sources.push(item.source);
      }
      existing.merged = true;
      // Prefer richer data (vendor, gallons, trip_number)
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

  return {
    earnings: allEarnings,
    expenses: Array.from(deduped.values()),
    periodStart,
    periodEnd,
    unitNumber,
  };
}
