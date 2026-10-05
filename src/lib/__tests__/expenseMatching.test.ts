import { describe, it, expect } from 'vitest';
import { isSameCharge, lineKind, matchOneToOne, matchTripTotals, type MatchableExpense } from '@/lib/expense-matching';


// Real line items from JeanWay's Landstar statements.
const warranty = (date: string): MatchableExpense => ({
  date, expense_type: 'Truck Warranty', amount: 87.94, description: 'NTP TRUCK WARRANTY PROG.',
});
const repairLoan = (date: string): MatchableExpense => ({
  date, expense_type: 'Misc', amount: 500, description: 'RPR/RPR COMBO LN 2/9/26',
});
const cardFee = (date: string): MatchableExpense => ({
  date, expense_type: 'Card Fee', amount: 1.75, description: 'CARD FEE',
});
const tripScan = (date: string): MatchableExpense => ({
  date, expense_type: 'Trip Scanning', amount: 2, description: 'TRKSTP SCN BLB 7181498',
});

describe('lineKind', () => {
  it('classifies real Landstar lines', () => {
    expect(lineKind(tripScan('2026-01-28'))).toBe('reference');
    expect(lineKind({ date: null, expense_type: 'Fuel', amount: 300, description: 'Fuel Purchase: AL237 LINCOLN AL Ref-060670032 PILOT #497' })).toBe('reference');
    expect(lineKind(cardFee('2026-06-10'))).toBe('transaction');
    expect(lineKind({ date: null, expense_type: 'PrePass/Scale', amount: 13.5, description: 'CAT Scale PORTAGE WI' })).toBe('transaction');
    expect(lineKind({ date: null, expense_type: 'PrePass/Scale', amount: 2.5, description: 'PREPASS' })).toBe('deduction');
    expect(lineKind(warranty('2026-06-13'))).toBe('deduction');
    expect(lineKind(repairLoan('2026-06-13'))).toBe('deduction');
  });
});

describe('isSameCharge', () => {
  it('weekly installments one week apart are NOT duplicates', () => {
    expect(isSameCharge(warranty('2026-06-13'), warranty('2026-06-20'))).toBe(false);
    expect(isSameCharge(repairLoan('2026-06-13'), repairLoan('2026-06-20'))).toBe(false);
  });

  it('the same installment dated a day apart IS a duplicate (XLSX vs PDF date drift)', () => {
    expect(isSameCharge(repairLoan('2026-06-13'), repairLoan('2026-06-14'))).toBe(true);
  });

  it('a reference-numbered line is a duplicate even when re-imported months later', () => {
    expect(isSameCharge(tripScan('2026-01-28'), tripScan('2026-04-04'))).toBe(true);
  });

  it('different reference numbers are different charges', () => {
    expect(isSameCharge(tripScan('2026-01-28'), { ...tripScan('2026-01-28'), description: 'TRKSTP SCN DLE 6065079' })).toBe(false);
  });

  it('card fees must match the exact date', () => {
    expect(isSameCharge(cardFee('2026-06-10'), cardFee('2026-06-10'))).toBe(true);
    expect(isSameCharge(cardFee('2026-06-10'), cardFee('2026-06-11'))).toBe(false);
  });

  it('different installments with the same amount are different charges', () => {
    const eld = { ...repairLoan('2026-06-13'), description: 'ELD EQUIPMENT LN 3/1/26' };
    expect(isSameCharge(repairLoan('2026-06-13'), eld)).toBe(false);
  });

  it('ignores punctuation and spacing differences between documents', () => {
    expect(isSameCharge(warranty('2026-06-13'), { ...warranty('2026-06-13'), description: 'NTP  TRUCK WARRANTY PROG' })).toBe(true);
  });
});

describe('matchOneToOne', () => {
  it('two identical installments on one statement never collapse onto one saved row', () => {
    const saved = [repairLoan('2026-06-13')];
    expect(matchOneToOne([repairLoan('2026-06-13'), repairLoan('2026-06-13')], saved)).toEqual([0, -1]);
  });

  it('four card fees in a day vs two already saved → two duplicates, two new', () => {
    const incoming = Array.from({ length: 4 }, () => cardFee('2026-06-10'));
    const saved = [cardFee('2026-06-10'), cardFee('2026-06-10')];
    expect(matchOneToOne(incoming, saved)).toEqual([0, 1, -1, -1]);
  });

  it("next week's statement imports every recurring deduction as new", () => {
    const lastWeek = [warranty('2026-06-13'), repairLoan('2026-06-13'), cardFee('2026-06-12')];
    const thisWeek = [warranty('2026-06-20'), repairLoan('2026-06-20'), cardFee('2026-06-19')];
    expect(matchOneToOne(thisWeek, lastWeek)).toEqual([-1, -1, -1]);
  });

  it('re-uploading the same statement flags everything as a duplicate', () => {
    const week = [warranty('2026-06-13'), repairLoan('2026-06-13'), cardFee('2026-06-12'), tripScan('2026-06-12')];
    expect(matchOneToOne(week, week)).toEqual([0, 1, 2, 3]);
  });
});


describe('matchTripTotals: itemized lines against summed lines (week ending 9/30/26)', () => {
  // Saved earlier from the Freight Bill export: summed per trip, dated by settlement.
  const saved: MatchableExpense[] = [
    { date: '2026-09-30', expense_type: 'Advance', amount: 1900, trip_number: '8357683', description: 'CARD PRE-TRIP' },
    { date: '2026-09-30', expense_type: 'Card Fee', amount: 3.5, trip_number: '8357683', description: 'CARD FEE' },
    { date: '2026-09-30', expense_type: 'Advance', amount: 1541.82, trip_number: '1121039', description: 'CARD PRE-TRIP' },
  ];
  // Itemized by the contractor PDF, dated by pickup.
  const incoming: MatchableExpense[] = [
    { date: '2026-09-22', expense_type: 'Advance', amount: 1500, trip_number: '8357683', description: 'GDR 8357683 CARD PRE-TRIP' },
    { date: '2026-09-24', expense_type: 'Advance', amount: 400, trip_number: '8357683', description: 'GDR 8357683 CARD PRE-TRIP' },
    { date: '2026-09-22', expense_type: 'Card Fee', amount: 1.75, trip_number: '8357683', description: 'GDR 8357683 CARD FEE' },
    { date: '2026-09-24', expense_type: 'Card Fee', amount: 1.75, trip_number: '8357683', description: 'GDR 8357683 CARD FEE' },
  ];

  it('recognises $1,500 + $400 as the saved $1,900 advance, and two $1.75 fees as the saved $3.50', () => {
    const first = matchOneToOne(incoming, saved);
    expect(first).toEqual([-1, -1, -1, -1]);
    expect(matchTripTotals(incoming, first, saved)).toEqual([0, 0, 1, 1]);
  });

  it('leaves new charges alone when the totals differ', () => {
    const extra = [...incoming, { date: '2026-09-25', expense_type: 'Advance', amount: 250, trip_number: '8357683', description: 'GDR 8357683 CARD PRE-TRIP' } as MatchableExpense];
    const first = matchOneToOne(extra, saved);
    expect(matchTripTotals(extra, first, saved).slice(0, 2)).toEqual([-1, -1]);
  });

  it('never pairs charges across different trips', () => {
    const other = incoming.map((e) => ({ ...e, trip_number: '9904275' }));
    expect(matchTripTotals(other, matchOneToOne(other, saved), saved)).toEqual([-1, -1, -1, -1]);
  });

  it('skips a saved row that normal matching already claimed', () => {
    const one: MatchableExpense[] = [{ date: '2026-09-30', expense_type: 'Advance', amount: 1900, trip_number: '8357683', description: 'CARD PRE-TRIP' }];
    const first = matchOneToOne(one, saved);
    expect(first).toEqual([0]);
    expect(matchTripTotals(one, first, saved)).toEqual([0]);
  });
});
