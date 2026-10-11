import { describe, expect, it } from 'vitest';
import { reconcileDocuments, type ExtractedExpense, type StagedFile } from '@/lib/settlement-reconciliation';

const exp = (o: Partial<ExtractedExpense> & Pick<ExtractedExpense, 'description' | 'amount'>): ExtractedExpense => ({
  date: '', expense_type: 'Misc', trip_number: null, vendor: null, gallons: null, is_discount: false, is_reimbursement: false, is_advance: false, ...o,
});
const staged = (type: StagedFile['type'], expenses: ExtractedExpense[]): StagedFile => ({
  file: {} as File, type, status: 'parsed',
  data: { statement_type: 'contractor', period_start: '2026-10-01', period_end: '2026-10-07', unit_number: null, expenses },
});

// Week ending 10/7/26: the PDF read dropped digits (LCN 3.69 as 0.69, PrePass 2.50 as 0.50, one toll 11.52 as 11.50)
// and left the toll dates off, while the spreadsheet sums each toll agency per day.
const pdf = [
  exp({ date: '2026-10-07', expense_type: 'LCN/Satellite', amount: 0.69, description: 'LCN FEES CONT.' }),
  exp({ date: '2026-10-07', expense_type: 'PrePass/Scale', amount: 0.5, description: 'PREPASS' }),
  exp({ date: '2026-10-01', expense_type: 'Tolls', amount: 7.89, description: 'BP OTA' }),
  exp({ date: '2026-10-02', expense_type: 'Tolls', amount: 11.52, description: 'BP OTA' }),
  exp({ date: '2026-10-02', expense_type: 'Tolls', amount: 11.5, description: 'BP OTA' }),
  exp({ date: '2026-10-03', expense_type: 'Tolls', amount: 7.89, description: 'BP OTA' }),
  ...[4.75, 8.45, 4.75, 16.95, 6, 8.45, 8.45, 8.45].map((amount) => exp({ date: '2026-10-03', expense_type: 'Tolls', amount, description: 'BP ILTOLL' })),
];
const xlsx = [
  exp({ date: '2026-10-07', expense_type: 'LCN/Satellite', amount: 3.69, description: 'LCN FEES - CONT.' }),
  exp({ date: '2026-10-07', expense_type: 'PrePass/Scale', amount: 2.5, description: 'PREPASS' }),
  exp({ date: '2026-10-07', expense_type: 'Tolls', amount: 30.93, description: 'BP OTA        09/24/26' }),
  exp({ date: '2026-10-07', expense_type: 'Tolls', amount: 7.89, description: 'BP OTA        09/25/26' }),
  exp({ date: '2026-10-07', expense_type: 'Tolls', amount: 40.9, description: 'BP ILTOLL     09/17/26' }),
  exp({ date: '2026-10-07', expense_type: 'Tolls', amount: 25.35, description: 'BP ILTOLL     09/18/26' }),
];

describe('contractor PDF vs Settlement Details when the PDF read has wrong digits', () => {
  const run = () => reconcileDocuments([staged('contractor_pdf', pdf), staged('settlement_xlsx', xlsx)]);
  const total = (r: ReturnType<typeof run>, word: string) =>
    Math.round(r.expenses.filter((e) => e.description.includes(word)).reduce((s, e) => s + e.amount, 0) * 100) / 100;

  it("uses the spreadsheet's amount where the PDF read disagrees", () => {
    const r = run();
    expect(total(r, 'LCN')).toBe(3.69);
    expect(total(r, 'PREPASS')).toBe(2.5);
    expect(r.crossCheck?.mismatches.map((m) => m.description)).toContain('LCN FEES - CONT.');
  });

  it('counts each toll once: day totals from the spreadsheet match the PDF lines that add up to them', () => {
    const r = run();
    expect(total(r, 'ILTOLL')).toBe(66.25);
    expect(total(r, 'OTA')).toBe(38.82);
  });
});
