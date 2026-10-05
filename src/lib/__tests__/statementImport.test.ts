import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseLandstarXlsx } from '@/lib/parse-landstar-xlsx';
import {
  reconcileDocuments,
  latestSettlementWednesday,
  type StagedFile,
  type ExtractedExpense,
} from '@/lib/settlement-reconciliation';
import { matchOneToOne } from '@/lib/expense-matching';

/** Build an .xlsx buffer shaped like a Landstar export. */
function workbook(rows: Record<string, unknown>[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Export');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const exp = (o: Partial<ExtractedExpense> & Pick<ExtractedExpense, 'description' | 'amount'>): ExtractedExpense => ({
  date: '',
  expense_type: 'Misc',
  trip_number: null,
  vendor: null,
  gallons: null,
  is_discount: false,
  is_reimbursement: false,
  is_advance: false,
  ...o,
});

const staged = (type: StagedFile['type'], expenses: ExtractedExpense[], period: [string | null, string | null] = [null, null]): StagedFile => ({
  file: {} as File,
  type,
  status: 'parsed',
  data: { statement_type: 'contractor', period_start: period[0], period_end: period[1], unit_number: null, expenses },
});

// --- Week ending 7/15/26, as Landstar exports it -----------------------------

const SETTLEMENT_DETAILS_0715 = [
  { 'Settlement Description': '2026 PLATES', 'Freight Bill #': '0', 'Transaction Amt': -94.44 },
  { 'Settlement Description': 'CARD FEE', 'Freight Bill #': '9794644', 'Transaction Amt': -3.5 },
  { 'Settlement Description': 'CARD PARTIAL FINAL SETT', 'Freight Bill #': '9911444', 'Transaction Amt': -960.18 },
  { 'Settlement Description': 'CARD PRE-TRIP', 'Freight Bill #': '9794644', 'Transaction Amt': -1200 },
  { 'Settlement Description': 'DD FEE DD#  3524889', 'Freight Bill #': '0', 'Transaction Amt': -1.75 },
  { 'Settlement Description': 'EOBR - AIRTIME', 'Freight Bill #': '0', 'Transaction Amt': -33.61 },
  { 'Settlement Description': 'FUEL SURCHARGE', 'Freight Bill #': '9794644', 'Transaction Amt': 470 },
  { 'Settlement Description': 'NTP TRUCK WARRANTY PROG.', 'Freight Bill #': '0', 'Transaction Amt': -87.94 },
  { 'Settlement Description': 'OPER EXP/RPR LN 6/23/26', 'Freight Bill #': '0', 'Transaction Amt': -487.06 },
  { 'Settlement Description': 'Tractor Line Haul', 'Freight Bill #': '8189944', 'Transaction Amt': -1264.64 },
  { 'Settlement Description': 'TRIP% ESCROW PAYMENT', 'Freight Bill #': '9794644', 'Transaction Amt': -213 },
  { 'Settlement Description': 'BP FDOT       07/02/26', 'Freight Bill #': '0', 'Transaction Amt': -6.88 },
  { 'Settlement Description': 'Total', 'Freight Bill #': '', 'Transaction Amt': 485.3 },
  { 'Settlement Description': 'Applied filters:\r\nSettlement Date is 07/15/26\r\nCal Year is 2026', 'Freight Bill #': '', 'Transaction Amt': '' },
];

const FREIGHT_BILL_0715 = [
  { 'Settlement Date': 46218, 'Freight Bill #': '8189944', Description: 'TRACTOR L/H', 'Transaction Amt': 1264.64, Code: '1' },
  { 'Settlement Date': 46218, 'Freight Bill #': '8189944', Description: 'FUEL SURCHARGE', 'Transaction Amt': -454.4, Code: 'X' },
  { 'Settlement Date': 46218, 'Freight Bill #': '1388083', Description: 'TRIP% ESCROW PAYMENT', 'Transaction Amt': -300, Code: 'C' },
  { 'Settlement Date': 46218, 'Freight Bill #': '1388083', Description: 'CARD FEE', 'Transaction Amt': -3.5, Code: 'B' },
  { 'Settlement Date': 46218, 'Freight Bill #': '1388083', Description: 'CARD PRE-TRIP', 'Transaction Amt': -1500, Code: 'V' },
  { 'Settlement Date': 46218, 'Freight Bill #': '9911444', Description: 'CARD PARTIAL FINAL SETT', 'Transaction Amt': -960.18, Code: 'V' },
  { 'Settlement Date': 46218, 'Freight Bill #': '1182511', Description: 'JUST IN TIME', 'Transaction Amt': -130, Code: 'X' },
];

// What the contractor-statement PDF parser returns for the same week (itemized, positive).
const CONTRACTOR_PDF_0715: ExtractedExpense[] = [
  exp({ date: '2026-07-08', expense_type: 'Card Fee', amount: 1.75, trip_number: '9794644', description: 'AUT 9794644 CARD FEE' }),
  exp({ date: '2026-07-09', expense_type: 'Card Fee', amount: 1.75, trip_number: '9794644', description: 'AUT 9794644 CARD FEE' }),
  exp({ date: '2026-07-08', expense_type: 'Card Load', amount: 700, trip_number: '9794644', description: 'AUT 9794644 CARD PRE-TRIP', is_advance: true }),
  exp({ date: '2026-07-09', expense_type: 'Card Load', amount: 500, trip_number: '9794644', description: 'AUT 9794644 CARD PRE-TRIP', is_advance: true }),
  exp({ date: '2026-07-09', amount: 960.18, trip_number: '9911444', description: 'FLS 9911444 CARD PARTIAL FINAL SETT' }),
  exp({ date: '2026-07-11', expense_type: 'Card Fee', amount: 1.75, trip_number: '1388083', description: 'PBJ 1388083 CARD FEE' }),
  exp({ date: '2026-07-13', expense_type: 'Card Fee', amount: 1.75, trip_number: '1388083', description: 'PBJ 1388083 CARD FEE' }),
  exp({ date: '2026-07-11', expense_type: 'Card Load', amount: 800, trip_number: '1388083', description: 'PBJ 1388083 CARD PRE-TRIP', is_advance: true }),
  exp({ date: '2026-07-13', expense_type: 'Card Load', amount: 700, trip_number: '1388083', description: 'PBJ 1388083 CARD PRE-TRIP', is_advance: true }),
  exp({ date: '2026-07-22', amount: 130, trip_number: '1182511', description: 'SOL 1182511 Just In Time' }),
  exp({ date: '2026-07-15', amount: 27.25, description: 'EOBR - AIRTIME' }),
  exp({ date: '2026-07-15', amount: 6.36, description: 'EOBR - AIRTIME' }),
  exp({ date: '2026-07-15', expense_type: 'Truck Warranty', amount: 75.47, description: 'NTP TRUCK WARRANTY PROG.' }),
  exp({ date: '2026-07-15', expense_type: 'Truck Warranty', amount: 12.47, description: 'NTP TRUCK WARRANTY PROG.' }),
  exp({ date: '2026-07-15', amount: 94.44, description: '2026 PLATES' }),
  exp({ date: '2026-07-15', amount: 487.06, description: 'OPER EXP/RPR LN 6/23/26' }),
  exp({ date: '2026-07-15', amount: 229.68, trip_number: '9911444', description: 'TRIP% ESCROW PAYMENT (VOLUNTARY) FLS 9911444' }),
  exp({ date: '2026-07-08', expense_type: 'Tolls', amount: 6.88, description: 'Other Adjustments: BP FDOT 07/02/26' }),
];

describe('parseLandstarXlsx', () => {
  it('Settlement Details: dates come from the footer, revenue/escrow/Total rows are skipped', async () => {
    const r = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715));
    const descs = r.expenses.map((e) => e.description);
    expect(descs).not.toContain('Total');
    expect(descs).not.toContain('FUEL SURCHARGE');
    expect(descs).not.toContain('Tractor Line Haul');
    expect(descs).not.toContain('TRIP% ESCROW PAYMENT');
    expect(r.expenses.every((e) => e.date === '2026-07-15')).toBe(true);
  });

  it('Settlement Details: classifies partial final settlement as an advance and BP lines as tolls', async () => {
    const r = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715));
    expect(r.expenses.find((e) => e.description === 'CARD PARTIAL FINAL SETT')!.is_advance).toBe(true);
    expect(r.expenses.find((e) => e.description.startsWith('BP FDOT'))!.expense_type).toBe('Tolls');
  });

  it('Settlement Details "Latest Week" export (no footer date) leaves dates blank for reconciliation', async () => {
    const r = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715.slice(0, 5)));
    expect(r.expenses.every((e) => e.date === '')).toBe(true);
  });

  it('Freight Bill: keeps only Code B charges and Code V advances', async () => {
    const r = await parseLandstarXlsx(workbook(FREIGHT_BILL_0715));
    expect(r.expenses.map((e) => e.description).sort()).toEqual(['CARD FEE', 'CARD PARTIAL FINAL SETT', 'CARD PRE-TRIP']);
    expect(r.expenses.filter((e) => e.is_advance)).toHaveLength(2);
    expect(r.period_end).toBe('2026-07-15');
  });
});

describe('reconcileDocuments — contractor PDF with XLSX cross-check (week ending 7/15/26)', () => {
  const run = async (pdf = CONTRACTOR_PDF_0715) => {
    const sd = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715));
    const fb = await parseLandstarXlsx(workbook(FREIGHT_BILL_0715));
    return reconcileDocuments([
      staged('contractor_pdf', pdf, ['2026-07-01', '2026-07-15']),
      staged('settlement_xlsx', sd.expenses, [sd.period_start, sd.period_end]),
      staged('freight_bill_xlsx', fb.expenses, [fb.period_start, fb.period_end]),
    ]);
  };

  it('imports the itemized PDF lines, not the XLSX sums', async () => {
    const r = await run();
    const byAmount = (a: number, b: number) => a - b;
    const warranty = r.expenses.filter((e) => e.description.includes('WARRANTY')).map((e) => e.amount).sort(byAmount);
    expect(warranty).toEqual([12.47, 75.47]);
    const airtime = r.expenses.filter((e) => e.description.includes('AIRTIME')).map((e) => e.amount).sort(byAmount);
    expect(airtime).toEqual([6.36, 27.25]);
  });

  it('keeps contractor deductions even though the PDF shows them as positive amounts', async () => {
    const r = await run();
    expect(r.expenses.some((e) => e.description === '2026 PLATES')).toBe(true);
    expect(r.expenses.some((e) => e.description === 'OPER EXP/RPR LN 6/23/26')).toBe(true);
  });

  it('drops revenue reversals and escrow from the PDF', async () => {
    const r = await run();
    const descs = r.expenses.map((e) => e.description.toUpperCase());
    expect(descs.some((d) => d.includes('JUST IN TIME'))).toBe(false);
    expect(descs.some((d) => d.includes('ESCROW'))).toBe(false);
  });

  it('treats partial final settlement as an advance, not a $960 expense', async () => {
    const r = await run();
    expect(r.expenses.some((e) => e.description.includes('PARTIAL FINAL'))).toBe(false);
    expect(r.advances.some((e) => e.description.includes('PARTIAL FINAL'))).toBe(true);
  });

  it('adds the DD fee the PDF parser missed, from Settlement Details', async () => {
    const r = await run();
    expect(r.crossCheck!.addedFromXlsx).toBe(1);
    expect(r.expenses.some((e) => e.description.startsWith('DD FEE'))).toBe(true);
  });

  it('reports no amount mismatches when the PDF and XLSX agree', async () => {
    const r = await run();
    expect(r.crossCheck!.mismatches).toEqual([]);
  });

  it('flags the line when the PDF parser misreads an amount', async () => {
    const misread = CONTRACTOR_PDF_0715.map((e) => (e.amount === 12.47 ? { ...e, amount: 12.74 } : e));
    const r = await run(misread);
    expect(r.crossCheck!.mismatches).toEqual([
      { description: 'NTP TRUCK WARRANTY PROG.', trip_number: null, xlsxAmount: 87.94, pdfAmount: 88.21 },
    ]);
  });

  it('clamps a month-long period from the PDF parser to the one-week Landstar period', async () => {
    const r = await run();
    expect([r.periodStart, r.periodEnd]).toEqual(['2026-07-09', '2026-07-15']);
  });
});

describe('reconcileDocuments — XLSX only', () => {
  it('"Latest Week" Settlement Details alone is dated to the most recent Wednesday, never the upload day', async () => {
    const sd = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715.slice(0, 5)));
    const saturday = new Date(2026, 9, 3); // Sat Oct 3, 2026
    const r = reconcileDocuments([staged('settlement_xlsx', sd.expenses)], [], 0.65, saturday);
    expect(r.datesInferred).toBe('latest_week');
    expect(new Set(r.expenses.map((e) => e.date))).toEqual(new Set(['2026-09-30']));
  });

  it('both XLSX exports together list per-trip charges once', async () => {
    const sd = await parseLandstarXlsx(workbook(SETTLEMENT_DETAILS_0715));
    const fb = await parseLandstarXlsx(workbook(FREIGHT_BILL_0715));
    const r = reconcileDocuments([
      staged('settlement_xlsx', sd.expenses, [sd.period_start, sd.period_end]),
      staged('freight_bill_xlsx', fb.expenses, [fb.period_start, fb.period_end]),
    ]);
    expect(r.advances.filter((e) => e.description === 'CARD PARTIAL FINAL SETT')).toHaveLength(1);
  });
});

describe('reconcileDocuments — revenue check needs statement revenue to compare', () => {
  const loads = [
    { id: 'l1', landstar_load_id: '9904275', origin: 'Lawton, OK', destination: 'Newnan, GA', rate: 2203.32, delivery_date: '2026-09-27' },
    { id: 'l2', landstar_load_id: '1121039', origin: 'Morrow, GA', destination: 'Rockville, MD', rate: 2430.3, delivery_date: '2026-09-29' },
  ];

  it('a Freight Bill export (no revenue lines) raises no discrepancy against loads delivered that week', async () => {
    // Freight Bill Details carries charges but no revenue, so there is nothing to compare loads against.
    const fb = await parseLandstarXlsx(workbook([
      { 'Settlement Date': 46295, 'Freight Bill #': '9904275', Description: 'CARD FEE', 'Transaction Amt': -1.75, Code: 'B' },
      { 'Settlement Date': 46295, 'Freight Bill #': '9904275', Description: 'CARD PRE-TRIP', 'Transaction Amt': -1591.27, Code: 'V' },
    ]));
    const r = reconcileDocuments([staged('freight_bill_xlsx', fb.expenses, [fb.period_start, fb.period_end])], loads);
    expect(r.revenue.period).toBeNull();
    expect(r.revenue.tripMismatches).toEqual([]);
    expect(r.revenue.hasBlockingDiscrepancy).toBe(false);
  });

  it('still compares against loads when the upload does carry statement revenue', () => {
    const pdf: StagedFile = {
      file: {} as File,
      type: 'contractor_pdf',
      status: 'parsed',
      data: {
        statement_type: 'contractor', period_start: '2026-09-24', period_end: '2026-09-30', unit_number: null, expenses: [],
        revenue: [{ date: '2026-09-27', trip_number: '9904275', flat_rate: 1432.16, reimbursement_total: 0, description: 'TRACTOR L/H' }],
      },
    };
    const r = reconcileDocuments([pdf], loads);
    expect(r.revenue.period).not.toBeNull();
  });
});

describe('latestSettlementWednesday', () => {
  it('finds the period-ending Wednesday', () => {
    expect(latestSettlementWednesday(new Date(2026, 9, 3))).toBe('2026-09-30'); // Sat
    expect(latestSettlementWednesday(new Date(2026, 8, 30))).toBe('2026-09-30'); // Wed itself
    expect(latestSettlementWednesday(new Date(2026, 6, 14))).toBe('2026-07-08'); // Tue
  });
});

describe('week-over-week import', () => {
  it("the next week's installments are new even with identical amounts and descriptions", async () => {
    const r1 = await (async () => reconcileDocuments([staged('contractor_pdf', CONTRACTOR_PDF_0715, ['2026-07-09', '2026-07-15'])]))();
    const saved = r1.expenses.map((e) => ({ date: e.date, expense_type: e.expense_type, amount: e.amount, description: e.description, trip_number: e.trip_number }));
    const nextWeek = saved
      .filter((e) => e.date === '2026-07-15')
      .map((e) => ({ ...e, date: '2026-07-22' }));
    expect(matchOneToOne(nextWeek, saved).every((i) => i === -1)).toBe(true);
    // ...while re-uploading the same week is caught.
    expect(matchOneToOne(saved, saved).every((i, idx) => i === idx)).toBe(true);
  });
});
