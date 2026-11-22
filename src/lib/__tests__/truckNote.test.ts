import { describe, expect, it } from 'vitest';
import { truckNoteForPeriod, unitsWithNote, weeklyNote } from '../truck-note';

const truck = (over: Record<string, unknown> = {}) => ({ unit_number: '433780', status: 'active', monthly_payment: 2600, loan_balance: 90000, loan_start_date: '2025-10-05', ...over });
const WEEK = ['2026-11-12', '2026-11-18']; // Thu to Wed, 7 days

describe('weeklyNote', () => {
  it('is a twelfth-of-a-year share over 52 weeks', () => {
    expect(weeklyNote(2600)).toBe(600);
    expect(weeklyNote(2500)).toBe(576.92);
  });
});

describe('unitsWithNote', () => {
  it('keeps active units that owe on a started loan', () => {
    expect(unitsWithNote([truck()], WEEK[1])).toHaveLength(1);
  });
  it('drops deleted, out-of-service, no-payment, paid-off and not-yet-started units', () => {
    const list = [
      truck({ deleted_at: '2026-01-01' }),
      truck({ status: 'out_of_service' }),
      truck({ monthly_payment: 0 }),
      truck({ monthly_payment: null }),
      truck({ loan_balance: 0 }),
      truck({ loan_start_date: '2027-01-05' }),
    ];
    expect(unitsWithNote(list, WEEK[1])).toHaveLength(0);
  });
  it('treats an unknown balance as still owing', () => {
    expect(unitsWithNote([truck({ loan_balance: null })], WEEK[1])).toHaveLength(1);
  });
});

describe('truckNoteForPeriod', () => {
  it('carries exactly one weekly share in a seven-day settlement week', () => {
    const n = truckNoteForPeriod([truck()], WEEK[0], WEEK[1]);
    expect(n).toMatchObject({ amount: 600, source: 'allocated', units: 1, weeks: 1 });
    expect(n.rule).toBe('Monthly note x 12 / 52 a week (1 unit). The same every week.');
  });

  it('is identical in every week, including the week the payment falls due', () => {
    const a = truckNoteForPeriod([truck()], '2026-11-05', '2026-11-11'); // holds the 5th
    const b = truckNoteForPeriod([truck()], '2026-11-12', '2026-11-18');
    expect(a.amount).toBe(b.amount);
  });

  it('sums several units', () => {
    expect(truckNoteForPeriod([truck(), truck({ unit_number: '2', monthly_payment: 1300 })], WEEK[0], WEEK[1]).amount).toBe(900);
  });

  it('scales to a longer period by whole weeks of days', () => {
    // a 28-day period is 4 weeks
    expect(truckNoteForPeriod([truck()], '2026-10-22', '2026-11-18').amount).toBe(2400);
  });

  it('shows recorded Truck Payment expenses instead of adding the allocation on top', () => {
    const n = truckNoteForPeriod([truck()], WEEK[0], WEEK[1], [
      { expense_type: 'Truck Payment', amount: 2600, expense_date: '2026-11-14' },
      { expense_type: 'Fuel', amount: 500, expense_date: '2026-11-14' },
      { expense_type: 'Truck Payment', amount: 2600, expense_date: '2026-10-05' }, // outside the week
    ]);
    expect(n).toMatchObject({ amount: 2600, source: 'recorded' });
    expect(n.rule).toMatch(/not added on top/);
  });

  it('is nothing when no unit owes a payment', () => {
    expect(truckNoteForPeriod([truck({ monthly_payment: null })], WEEK[0], WEEK[1])).toMatchObject({ amount: 0, source: 'none' });
    expect(truckNoteForPeriod([], WEEK[0], WEEK[1]).amount).toBe(0);
  });
});
