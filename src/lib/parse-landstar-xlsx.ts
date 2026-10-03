// xlsx is large (~140 KB gz). Load it lazily only when parsing.
type XLSXModule = typeof import('xlsx');
let xlsxPromise: Promise<XLSXModule> | null = null;
function loadXLSX(): Promise<XLSXModule> {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
}

interface ExtractedExpense {
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

interface ParsedStatement {
  statement_type: 'card_activity' | 'contractor';
  period_start: string | null;
  period_end: string | null;
  unit_number: string | null;
  expenses: ExtractedExpense[];
}

// Revenue patterns to skip entirely
const REVENUE_IGNORE_PATTERNS: RegExp[] = [
  /\bTRACTOR\s*L\/H\b/i,
  /\bLINE\s*HAUL\b/i,
  /\b1099\s*REVENUE\b/i,
  /\bLINEHAUL\b/i,
  /\bTRACTOR\s*LEASE\b/i,
  /\bTRIP%?\s*ESCROW/i,
  /\bFUEL\s*SURCHARGE\b/i,
];

// Advance patterns (non-P&L)
const ADVANCE_PATTERNS: RegExp[] = [
  /\bADVANCE\b/i,
  /\bCARD PRE-TRIP\b/i,
  /\bCARD CONT\.?\s*SPEC\s*ADV\b/i,
  /\bPARTIAL\s*FINAL\s*S(ETT|T)\b/i,
];

const EXPENSE_TYPE_MAP: [RegExp, string][] = [
  [/\bCARD FEE\b/i, 'Card Fee'],
  [/\bCARD PRE-TRIP\b/i, 'Advance'],
  [/\bCARD CONT\.?\s*SPEC\s*ADV\b/i, 'Advance'],
  
  [/\bTRKSTP SCN\b/i, 'Trip Scanning'],
  [/\bDD FEE\b/i, 'Direct Deposit Fee'],
  [/\bPERMIT/i, 'Licensing/Permits'],
  [/\bPLATE\b/i, 'Registration/Plates'],
  // Bill-by-plate tolls: "BP <agency> <MM/DD/YY>" (OTA, NTTA, E470, FDOT, DelDOT, DRBA…)
  [/^BP\s+[A-Z0-9]+\s+\d{2}\/\d{2}\/\d{2}\b/i, 'Tolls'],
  [/\bPREPASS\b/i, 'PrePass/Scale'],
  [/\bLCN\s*FEES?\b/i, 'LCN/Satellite'],
  [/\bNTP\s*TRUCK\s*WARRANTY\b/i, 'Truck Warranty'],
  [/\bUNLADEN\s*LIABILITY\b/i, 'Insurance'],
  [/\bCPP\b/i, 'CPP/Benefits'],
  [/\bREIMB\b/i, 'Reimbursement'],
  [/\bESCROW\b/i, 'Misc'],
];

function mapExpenseType(description: string): string {
  for (const [pattern, type] of EXPENSE_TYPE_MAP) {
    if (pattern.test(description)) return type;
  }
  return 'Misc';
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return 0;
  // Handle "(123.45)" as negative
  const parenMatch = raw.match(/^\(([0-9.,]+)\)$/);
  if (parenMatch) return -parseFloat(parenMatch[1].replace(/,/g, ''));
  return parseFloat(raw.replace(/[^0-9.\-]/g, '')) || 0;
}

function parseDate(raw: unknown, xlsx: XLSXModule): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    // Excel serial date
    const d = xlsx.SSF.parse_date_code(raw);
    if (d) {
      const yyyy = d.y;
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }
  const str = String(raw).trim();
  // MM/DD/YY or MM/DD/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

function findFooterSettlementDate(rows: Record<string, unknown>[]): string | null {
  for (const row of rows) {
    for (const value of Object.values(row)) {
      const m = String(value ?? '').match(/Settlement Date is (\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
      if (m) {
        const year = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
        return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      }
    }
  }
  return null;
}

export async function parseLandstarXlsx(buffer: ArrayBuffer): Promise<ParsedStatement> {
  const xlsx = await loadXLSX();
  const workbook = xlsx.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) {
    return { statement_type: 'contractor', period_start: null, period_end: null, unit_number: null, expenses: [] };
  }

  const headers = Object.keys(rows[0]);
  const isFreightBill = headers.some(h => /settlement\s*date/i.test(h));
  const hasCodeColumn = headers.includes('Code');

  // Settlement Details has no date column. When exported for a specific week its
  // footer reads "Settlement Date is 07/15/26"; "Latest Week" exports carry no date
  // and are dated during reconciliation instead.
  const footerDate = findFooterSettlementDate(rows);

  let unitNumber: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const expenses: ExtractedExpense[] = [];

  for (const row of rows) {
    const description = String(
      row['Settlement Description'] || row['Description'] || ''
    ).trim();
    if (!description) continue;
    if (/^total$/i.test(description) || /^applied filters/i.test(description)) continue;

    // Freight Bill Details codes: B = charge, V = advance, C = escrow,
    // 1/3 = linehaul/FSC/accessorial revenue, X = reversal. Only B and V are costs.
    const code = hasCodeColumn ? String(row['Code'] ?? '').trim().toUpperCase() : '';
    if (hasCodeColumn && code !== 'B' && code !== 'V') continue;

    // Skip general revenue/income lines entirely
    if (REVENUE_IGNORE_PATTERNS.some(p => p.test(description))) continue;

    const rawAmount = row['Transaction Amt'] ?? row['Transaction Amount'] ?? 0;
    const amount = parseAmount(rawAmount);

    const isReimb = /REIMB/i.test(description);
    const isAdvance = code === 'V' || ADVANCE_PATTERNS.some(p => p.test(description));
    const isDiscount = /\bNATS\s*DISCOUNT\b/i.test(description) || /\bDISCOUNT\b/i.test(description);

    // Skip revenue rows (positive amount, not a reimbursement/advance/discount)
    if (amount >= 0 && !isReimb && !isAdvance && !isDiscount) continue;

    // Extract trip number
    const rawTrip = String(row['Freight Bill #'] || row['Freight Bill'] || '').trim();
    const tripNumber = rawTrip && rawTrip !== '0' ? rawTrip : null;

    // Extract date
    let date: string | null = null;
    if (isFreightBill) {
      date = parseDate(row['Settlement Date'], xlsx);
    }
    if (!date) date = footerDate;

    // Extract unit number from first row that has it
    if (!unitNumber && isFreightBill) {
      const tractor = String(row['Tractor #'] || '').trim();
      if (tractor) unitNumber = tractor;
    }

    // Track period dates
    if (date) {
      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }

    const expenseType = mapExpenseType(description);

    expenses.push({
      // Undated rows are filled with the statement period end during reconciliation.
      date: date || '',
      expense_type: isAdvance ? 'Advance' : (isReimb ? 'Reimbursement' : expenseType),
      amount: Math.abs(amount),
      trip_number: tripNumber,
      description,
      vendor: null,
      gallons: null,
      is_discount: isDiscount,
      is_reimbursement: isReimb,
      is_advance: isAdvance,
    });
  }

  return {
    statement_type: isFreightBill ? 'contractor' : 'card_activity',
    period_start: periodStart,
    period_end: periodEnd,
    unit_number: unitNumber,
    expenses,
  };
}
