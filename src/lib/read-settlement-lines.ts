import type { SettlementLine } from '@/lib/settlement-trueup';

// xlsx is large (~140 KB gz). Load it lazily only when a file is read.
type XLSXModule = typeof import('xlsx');
let xlsxPromise: Promise<XLSXModule> | null = null;
const loadXLSX = () => (xlsxPromise ??= import('xlsx'));

function isoDate(raw: unknown, xlsx: XLSXModule): string | null {
  if (typeof raw === 'number') {
    const d = xlsx.SSF.parse_date_code(raw);
    // Landstar leaves undelivered trips at 1/1/1901; that is no date.
    return d && d.y >= 2000 ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  return null;
}

/** Reads a Freight Bill Details export into one record per settlement line. */
export async function readSettlementLines(buffer: ArrayBuffer): Promise<SettlementLine[]> {
  const xlsx = await loadXLSX();
  const workbook = xlsx.read(buffer, { type: 'array' });
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  if (!['Freight Bill #', 'Code', 'Transaction Amt'].every((h) => headers.includes(h))) {
    throw new Error('This is not a Freight Bill Details export. Use the Freight Bill Details file from Landstar, not Settlement Details.');
  }

  const lines: SettlementLine[] = [];
  for (const row of rows) {
    const trip = String(row['Freight Bill #'] ?? '').trim();
    const amount = Number(row['Transaction Amt']);
    if (!trip || trip === '0' || !Number.isFinite(amount)) continue;
    lines.push({
      trip,
      description: String(row['Description'] ?? '').trim(),
      code: String(row['Code'] ?? '').trim().toUpperCase(),
      amount,
      delivery: isoDate(row['Delivery Date'], xlsx),
      settled: isoDate(row['Settlement Date'], xlsx),
      pickup: isoDate(row['Pickup Date'], xlsx),
      lane: String(row['OD Lane'] ?? '').trim() || null,
    });
  }
  return lines;
}
