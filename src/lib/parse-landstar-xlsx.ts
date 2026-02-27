import * as XLSX from 'xlsx';

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
}

interface ParsedStatement {
  statement_type: 'card_activity' | 'contractor';
  period_start: string | null;
  period_end: string | null;
  unit_number: string | null;
  expenses: ExtractedExpense[];
}

const EXPENSE_TYPE_MAP: [RegExp, string][] = [
  [/\bCARD FEE\b/i, 'Card Fee'],
  [/\bCARD PRE-TRIP\b/i, 'Card Load'],
  [/\bCARD CONT\.\s*SPEC ADV\b/i, 'Cash Advance'],
  [/\bTRIP%?\s*ESCROW/i, 'Escrow Payment'],
  [/\bTRKSTP SCN\b/i, 'Trip Scanning'],
  [/\bDD FEE\b/i, 'Direct Deposit Fee'],
  [/\bPERMIT/i, 'Licensing/Permits'],
  [/\bPLATE\b/i, 'Registration/Plates'],
  [/\bBP\s+(OTA|NTTA|E470)\b/i, 'Tolls'],
  [/\bPREPASS\b/i, 'PrePass/Scale'],
  [/\bLCN\s*FEES?\b/i, 'LCN/Satellite'],
  [/\bNTP\s*TRUCK\s*WARRANTY\b/i, 'Truck Warranty'],
  [/\bUNLADEN\s*LIABILITY\b/i, 'Insurance'],
  [/\bCPP\b/i, 'CPP/Benefits'],
  [/\bREIMB\b/i, 'Reimbursement'],
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

function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw);
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

export function parseLandstarXlsx(buffer: ArrayBuffer): ParsedStatement {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) {
    return { statement_type: 'contractor', period_start: null, period_end: null, unit_number: null, expenses: [] };
  }

  const headers = Object.keys(rows[0]);
  const isFreightBill = headers.some(h => /settlement\s*date/i.test(h));

  let unitNumber: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const expenses: ExtractedExpense[] = [];

  for (const row of rows) {
    const description = String(
      row['Settlement Description'] || row['Description'] || ''
    ).trim();
    if (!description) continue;

    const rawAmount = row['Transaction Amt'] ?? row['Transaction Amount'] ?? 0;
    const amount = parseAmount(rawAmount);

    const isReimb = /REIMB/i.test(description);

    // Skip revenue rows (positive amount, not a reimbursement)
    if (amount >= 0 && !isReimb) continue;

    // Extract trip number
    const rawTrip = String(row['Freight Bill #'] || row['Freight Bill'] || '').trim();
    const tripNumber = rawTrip && rawTrip !== '0' ? rawTrip : null;

    // Extract date
    let date: string | null = null;
    if (isFreightBill) {
      date = parseDate(row['Settlement Date']);
    }
    // Fallback: try any date-looking column
    if (!date) {
      for (const key of ['Settlement Date', 'Pickup Date', 'Delivery Date']) {
        date = parseDate(row[key]);
        if (date) break;
      }
    }

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
      date: date || new Date().toISOString().slice(0, 10),
      expense_type: isReimb ? 'Reimbursement' : expenseType,
      amount: isReimb ? Math.abs(amount) : Math.abs(amount),
      trip_number: tripNumber,
      description,
      vendor: null,
      gallons: null,
      is_discount: false,
      is_reimbursement: isReimb,
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
