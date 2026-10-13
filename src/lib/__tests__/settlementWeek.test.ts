import { describe, it, expect } from 'vitest';
import { layoutLogbook, logbookState, settlementWeek } from '@/lib/settlement-week';
import { cityState } from '@/lib/formatters';

describe('settlementWeek', () => {
  it('runs Thursday through the period-ending Wednesday', () => {
    const w = settlementWeek(new Date(2026, 9, 3)); // Sat Oct 3, 2026
    expect(w.isoDays[0]).toBe('2026-10-01'); // Thursday
    expect(w.isoDays[6]).toBe('2026-10-07'); // Wednesday
  });

  it('a Wednesday belongs to the week it ends', () => {
    expect(settlementWeek(new Date(2026, 8, 30)).isoDays[6]).toBe('2026-09-30');
  });

  it('offsets by whole weeks', () => {
    expect(settlementWeek(new Date(2026, 9, 3), -1).isoDays).toEqual([
      '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
    ]);
  });
});

describe('layoutLogbook', () => {
  const week = settlementWeek(new Date(2026, 9, 3)); // Thu Oct 1 - Wed Oct 7
  const load = (id: string, pickup: string | null, delivery: string | null, status = 'delivered') => ({
    id, pickup_date: pickup, delivery_date: delivery, status,
  });

  it('draws a load from pickup day to delivery day', () => {
    const [s] = layoutLogbook([load('a', '2026-10-02', '2026-10-05')], week);
    expect([s.fromCol, s.toCol, s.continuesBefore, s.continuesAfter]).toEqual([1, 4, false, false]);
  });

  it('clips loads that started last week or run into next week', () => {
    const [before, after] = layoutLogbook(
      [load('a', '2026-09-29', '2026-10-01'), load('b', '2026-10-06', '2026-10-09')],
      week,
    );
    expect([before.fromCol, before.toCol, before.continuesBefore]).toEqual([0, 0, true]);
    expect([after.fromCol, after.toCol, after.continuesAfter]).toEqual([5, 6, true]);
  });

  it('treats a missing delivery date as a one-day load', () => {
    const [s] = layoutLogbook([load('a', '2026-10-03', null)], week);
    expect([s.fromCol, s.toCol]).toEqual([2, 2]);
  });

  it('leaves out loads that never touch the week, and sorts by pickup', () => {
    const out = layoutLogbook(
      [load('late', '2026-10-06', '2026-10-06'), load('early', '2026-10-01', '2026-10-02'), load('old', '2026-09-20', '2026-09-22')],
      week,
    );
    expect(out.map((s) => s.load.id)).toEqual(['early', 'late']);
  });
});

describe('logbookState', () => {
  it('maps statuses to the four marks', () => {
    expect(logbookState('assigned')).toBe('planned');
    expect(logbookState('in_transit')).toBe('moving');
    expect(logbookState('unloading')).toBe('moving');
    expect(logbookState('delivered')).toBe('delivered');
    expect(logbookState('cancelled')).toBe('cancelled');
  });
});

describe('cityState', () => {
  it('pulls city and state out of a full stop address', () => {
    expect(cityState('Rheem Manufacturing Acd, 3900 S Zero St, Fort Smith, AR 72908-6919')).toBe('Fort Smith, AR');
    expect(cityState('AMAZON RDU2, 2150 US HWY 70 BUSINESS WEST, SMITHFIELD, NC 27577')).toBe('Smithfield, NC');
    expect(cityState('Lawton, OK')).toBe('Lawton, OK');
    expect(cityState('Yard')).toBe('Yard');
    expect(cityState(null)).toBe('');
  });
});
