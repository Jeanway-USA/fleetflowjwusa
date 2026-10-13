import { describe, it, expect } from 'vitest';
import { findPossibleDuplicates, type DuplicateCheckExpense } from '@/lib/duplicate-check';

let n = 0;
const row = (o: Partial<DuplicateCheckExpense> & Pick<DuplicateCheckExpense, 'expense_type' | 'amount'>): DuplicateCheckExpense => ({
  id: `r${++n}`,
  expense_date: '2026-09-30',
  description: null,
  load_id: null,
  created_at: '2026-10-05T04:39:00Z',
  ...o,
});

// The two uploads that actually double-filed the week ending 9/30/26.
const FIRST_UPLOAD = '2026-10-05T04:39:03Z'; // Freight Bill export: summed per trip, dated by settlement
const SECOND_UPLOAD = '2026-10-05T04:52:10Z'; // contractor PDF: itemized, dated by pickup

describe('findPossibleDuplicates: the 9/30/26 double import', () => {
  const saved = [
    row({ expense_type: 'Advance', amount: 1900, load_id: 'L8357683', description: 'CARD PRE-TRIP', created_at: FIRST_UPLOAD }),
    row({ expense_type: 'Card Fee', amount: 3.5, load_id: 'L8357683', description: 'CARD FEE', created_at: FIRST_UPLOAD }),
    row({ expense_type: 'Advance', amount: 1541.82, load_id: 'L1121039', description: 'CARD PRE-TRIP', created_at: FIRST_UPLOAD }),
  ];
  const itemized = [
    row({ expense_type: 'Advance', amount: 1500, load_id: 'L8357683', expense_date: '2026-09-22', description: 'CARD PRE-TRIP', created_at: SECOND_UPLOAD }),
    row({ expense_type: 'Advance', amount: 400, load_id: 'L8357683', expense_date: '2026-09-24', description: 'CARD PRE-TRIP', created_at: SECOND_UPLOAD }),
    row({ expense_type: 'Card Fee', amount: 1.75, load_id: 'L8357683', expense_date: '2026-09-22', description: 'CARD FEE', created_at: SECOND_UPLOAD }),
    row({ expense_type: 'Card Fee', amount: 1.75, load_id: 'L8357683', expense_date: '2026-09-24', description: 'CARD FEE', created_at: SECOND_UPLOAD }),
    row({ expense_type: 'Advance', amount: 1541.82, load_id: 'L1121039', expense_date: '2026-09-28', description: 'CARD PRE-TRIP', created_at: SECOND_UPLOAD }),
  ];
  const groups = findPossibleDuplicates([...saved, ...itemized], { tripOf: (id) => id.replace('L', '') });

  it('finds the $1,900 advance split as $1,500 + $400 and suggests removing the newer lines', () => {
    const g = groups.find((x) => x.title.includes('8357683') && x.title.includes('advances'))!;
    expect(g.kind).toBe('trip_total');
    expect(g.title).toContain('$1,900.00');
    expect(g.reason).toContain('$1,500.00 + $400.00');
    expect(g.suggestRemove).toEqual([itemized[0].id, itemized[1].id]);
  });

  it('finds the $3.50 card fee split as two $1.75 fees', () => {
    const g = groups.find((x) => x.title.includes('8357683') && x.title.includes('card fees'))!;
    expect(g.suggestRemove).toEqual([itemized[2].id, itemized[3].id]);
  });

  it('finds an identical advance filed once by each upload', () => {
    const g = groups.find((x) => x.title.includes('1121039'))!;
    expect(g.suggestRemove).toEqual([itemized[4].id]);
  });

  it('never suggests removing the older, originally saved lines', () => {
    const removals = new Set(groups.flatMap((g) => g.suggestRemove));
    saved.forEach((s) => expect(removals.has(s.id)).toBe(false));
  });
});

describe('findPossibleDuplicates: things that are not duplicates', () => {
  it('leaves two equal pre-trip loads from the same statement alone', () => {
    const rows = [
      row({ expense_type: 'Advance', amount: 1000, load_id: 'L1', created_at: SECOND_UPLOAD }),
      row({ expense_type: 'Advance', amount: 1000, load_id: 'L1', created_at: SECOND_UPLOAD }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it('leaves weekly deductions on different weeks alone', () => {
    const rows = [
      row({ expense_type: 'Insurance', amount: 33.98, expense_date: '2026-09-23', description: 'UNLADEN LIABILITY STD P', created_at: FIRST_UPLOAD }),
      row({ expense_type: 'Insurance', amount: 33.98, expense_date: '2026-09-30', description: 'UNLADEN LIABILITY STD P', created_at: SECOND_UPLOAD }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it('leaves a trip with different totals alone', () => {
    const rows = [
      row({ expense_type: 'Advance', amount: 1900, load_id: 'L1', created_at: FIRST_UPLOAD }),
      row({ expense_type: 'Advance', amount: 1500, load_id: 'L1', created_at: SECOND_UPLOAD }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it('leaves rows without an upload time alone', () => {
    const rows = [
      row({ expense_type: 'Advance', amount: 100, load_id: 'L1', created_at: null }),
      row({ expense_type: 'Advance', amount: 100, load_id: 'L1', created_at: null }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });
});

describe('findPossibleDuplicates: reference numbers and same-day charges', () => {
  it('flags a card purchase filed twice under the same reference', () => {
    const rows = [
      row({ expense_type: 'Fuel', amount: 406.84, description: 'Fuel Purchase: AR307 NORTH LITTLE AR Ref-062415666 PETRO FUEL #326', created_at: FIRST_UPLOAD }),
      row({ expense_type: 'Fuel', amount: 406.84, expense_date: '2026-09-25', description: 'Fuel Purchase: AR307 NORTH LITTLE AR Ref-062415666', created_at: SECOND_UPLOAD }),
    ];
    const [g] = findPossibleDuplicates(rows);
    expect(g.kind).toBe('reference');
    expect(g.suggestRemove).toEqual([rows[1].id]);
  });

  it('does not flag the same scan reference on two different trips', () => {
    const rows = [
      row({ expense_type: 'Trip Scanning', amount: 2, description: 'TRKSTP SCN CQQ 1121039', created_at: FIRST_UPLOAD }),
      row({ expense_type: 'Trip Scanning', amount: 2, description: 'TRKSTP SCN DLS 9904275', created_at: SECOND_UPLOAD }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it('flags an identical toll on one day added by two uploads, but not two on one statement', () => {
    const toll = (created: string) => row({ expense_type: 'Tolls', amount: 10, description: 'BP DelDOT 09/22/26', created_at: created });
    expect(findPossibleDuplicates([toll(FIRST_UPLOAD), toll(SECOND_UPLOAD)])).toHaveLength(1);
    expect(findPossibleDuplicates([toll(SECOND_UPLOAD), toll(SECOND_UPLOAD)])).toEqual([]);
  });
});

describe('findPossibleDuplicates: Landstar charges per scan and per card use', () => {
  it('does not flag a trip scanned more than once, even from two uploads', () => {
    // Each scanned document is its own $2.00 charge, and the description repeats the trip number.
    const scan = (date: string, created: string) =>
      row({ expense_type: 'Trip Scanning', amount: 2, expense_date: date, load_id: 'L1', description: 'TRKSTP SCN GAO 0017004', created_at: created });
    expect(findPossibleDuplicates([scan('2026-03-18', FIRST_UPLOAD), scan('2026-04-04', SECOND_UPLOAD)])).toEqual([]);
    expect(findPossibleDuplicates([scan('2026-03-18', FIRST_UPLOAD), scan('2026-04-04', FIRST_UPLOAD)])).toEqual([]);
  });

  it('does not flag two single $1.75 card fees on a trip, even from two uploads', () => {
    const fee = (created: string) => row({ expense_type: 'Card Fee', amount: 1.75, load_id: 'L1', description: 'CARD FEE', created_at: created });
    expect(findPossibleDuplicates([fee(FIRST_UPLOAD), fee(SECOND_UPLOAD)])).toEqual([]);
  });

  it('still flags a summed fee line against the same fees itemized', () => {
    const rows = [
      row({ expense_type: 'Trip Scanning', amount: 4, load_id: 'L1', description: 'TRKSTP SCN GAO 0017004', created_at: FIRST_UPLOAD }),
      row({ expense_type: 'Trip Scanning', amount: 2, load_id: 'L1', description: 'TRKSTP SCN GAO 0017004', created_at: SECOND_UPLOAD }),
      row({ expense_type: 'Trip Scanning', amount: 2, load_id: 'L1', description: 'TRKSTP SCN GAO 0017004', created_at: SECOND_UPLOAD }),
    ];
    const [g] = findPossibleDuplicates(rows);
    expect(g.kind).toBe('trip_total');
    expect(g.title).toContain('scan fees');
  });
});

describe('findPossibleDuplicates: repeated fees to check (one copy dated the import day)', () => {
  // Real pair from the data: one scan with a real date and one dated the day it was imported.
  const IMPORT = '2026-04-04T20:12:00Z';
  const scan = (date: string, created = IMPORT) =>
    row({ expense_type: 'Trip Scanning', amount: 2, expense_date: date, description: 'TRKSTP SCN GAO 0017004', created_at: created });

  it('lists the import-dated copy for review, apart from likely duplicates', () => {
    const real = scan('2026-03-18');
    const copy = scan('2026-04-04');
    const [g] = findPossibleDuplicates([real, copy]);
    expect(g.kind).toBe('repeat_fee');
    expect(g.title).toBe('Scan fee $2.00 appears twice for GAO 0017004');
    expect(g.suggestRemove).toEqual([copy.id]);
    expect(g.reason).toContain('Check the statement');
  });

  it('stays quiet when both scans carry real dates', () => {
    expect(findPossibleDuplicates([scan('2026-03-18'), scan('2026-03-25')])).toEqual([]);
  });

  it('stays quiet when the pair came from different imports', () => {
    expect(findPossibleDuplicates([scan('2026-03-18', '2026-03-19T10:00:00Z'), scan('2026-04-04')])).toEqual([]);
  });

  it('groups card fees only within one trip', () => {
    const fee = (loadId: string | null, date: string) => row({ expense_type: 'Card Fee', amount: 1.75, expense_date: date, load_id: loadId, description: 'CARD FEE', created_at: IMPORT });
    expect(findPossibleDuplicates([fee('L1', '2026-03-18'), fee('L2', '2026-04-04')])).toEqual([]);
    expect(findPossibleDuplicates([fee(null, '2026-03-18'), fee(null, '2026-04-04')])).toEqual([]);
    expect(findPossibleDuplicates([fee('L1', '2026-03-18'), fee('L1', '2026-04-04')])).toHaveLength(1);
  });
});
