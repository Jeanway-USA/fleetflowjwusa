import { describe, expect, it } from 'vitest';
import {
  LANDSTAR_WEEK_END_DAY, LANDSTAR_WEEK_STARTS_ON, latestPeriodEnd, layoutLogbook, periodEndOnOrAfter, settlementWeek, toWeekDay, weekdayName, weekEndDayFor, weekStartsOnFor,
} from '@/lib/settlement-week';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('the Landstar default', () => {
  it('ends on Wednesday and starts on Thursday', () => {
    expect(LANDSTAR_WEEK_END_DAY).toBe(3);
    expect(LANDSTAR_WEEK_STARTS_ON).toBe(4);
    expect(weekStartsOnFor(LANDSTAR_WEEK_END_DAY)).toBe(LANDSTAR_WEEK_STARTS_ON);
    expect(weekEndDayFor(LANDSTAR_WEEK_STARTS_ON)).toBe(LANDSTAR_WEEK_END_DAY);
  });
  it('is what settlementWeek uses when no start day is given', () => {
    expect(settlementWeek(new Date(2026, 9, 3)).isoDays[0]).toBe('2026-10-01'); // Thursday
  });
});

describe('end day and start day are two names for one choice', () => {
  it('converts both ways for every day, including the wrap from Saturday to Sunday', () => {
    for (const end of [0, 1, 2, 3, 4, 5, 6] as const) expect(weekEndDayFor(weekStartsOnFor(end))).toBe(end);
    expect(weekStartsOnFor(6)).toBe(0); // ends Saturday, starts Sunday
    expect(weekStartsOnFor(0)).toBe(1); // ends Sunday, starts Monday
    expect(weekEndDayFor(0)).toBe(6);
  });
});

describe('a week with another end day', () => {
  // Sat Oct 3, 2026
  const ref = new Date(2026, 9, 3);
  it('ending Sunday runs Monday to Sunday', () => {
    const w = settlementWeek(ref, 0, weekStartsOnFor(0));
    expect([w.isoDays[0], w.isoDays[6]]).toEqual(['2026-09-28', '2026-10-04']);
    expect(w.start.getDay()).toBe(1);
    expect(w.end.getDay()).toBe(0);
  });
  it('ending Friday runs Saturday to Friday', () => {
    const w = settlementWeek(ref, 0, weekStartsOnFor(5));
    expect([w.isoDays[0], w.isoDays[6]]).toEqual(['2026-10-03', '2026-10-09']);
  });
  it('ending Saturday runs Sunday to Saturday', () => {
    const w = settlementWeek(ref, 0, weekStartsOnFor(6));
    expect([w.isoDays[0], w.isoDays[6]]).toEqual(['2026-09-27', '2026-10-03']);
  });
  it('the last day of the week belongs to that week, and always gives seven days', () => {
    for (const end of [0, 1, 2, 3, 4, 5, 6] as const) {
      const w = settlementWeek(new Date(2026, 9, 14), 0, weekStartsOnFor(end));
      expect(w.days).toHaveLength(7);
      expect(w.end.getDay()).toBe(end);
    }
  });
  it('offsets by whole weeks from the chosen boundary', () => {
    expect(settlementWeek(ref, -1, weekStartsOnFor(0)).isoDays[6]).toBe('2026-09-27');
  });
  it('places loads on the right columns for the chosen week', () => {
    const week = settlementWeek(new Date(2026, 9, 3), 0, weekStartsOnFor(0)); // Mon Sep 28 - Sun Oct 4
    const [s] = layoutLogbook([{ id: 'a', pickup_date: '2026-10-02', delivery_date: '2026-10-05', status: 'delivered' }], week);
    expect(s).toMatchObject({ fromCol: 4, toCol: 6, continuesAfter: true });
  });
});

describe('finding the period-ending day', () => {
  it('the period end on or after a date: a load belongs to the week that ends on or after its day', () => {
    expect(ymd(periodEndOnOrAfter(new Date(2026, 9, 1)))).toBe('2026-10-07'); // Thu -> Wed (default)
    expect(ymd(periodEndOnOrAfter(new Date(2026, 9, 7)))).toBe('2026-10-07'); // the Wednesday itself
    expect(ymd(periodEndOnOrAfter(new Date(2026, 9, 1), 0))).toBe('2026-10-04'); // Thu -> Sun
    expect(ymd(periodEndOnOrAfter(new Date(2026, 9, 4), 0))).toBe('2026-10-04'); // the Sunday itself
    expect(ymd(periodEndOnOrAfter(new Date(2026, 11, 30), 5))).toBe('2027-01-01'); // across a year end
  });
  it('the latest period end on or before a date', () => {
    expect(ymd(latestPeriodEnd(new Date(2026, 9, 3)))).toBe('2026-09-30'); // Sat -> Wed (default)
    expect(ymd(latestPeriodEnd(new Date(2026, 9, 7)))).toBe('2026-10-07'); // the Wednesday itself
    expect(ymd(latestPeriodEnd(new Date(2026, 9, 3), 5))).toBe('2026-10-02'); // Sat -> Fri
    expect(ymd(latestPeriodEnd(new Date(2026, 0, 2), 0))).toBe('2025-12-28'); // Fri -> Sunday, before the year
  });
});

describe('reading the saved setting', () => {
  it('accepts 0 to 6 as a number or text and falls back to Wednesday for anything else', () => {
    expect(toWeekDay(0)).toBe(0);
    expect(toWeekDay(6)).toBe(6);
    expect(toWeekDay('5')).toBe(5);
    expect(toWeekDay(null)).toBe(3);
    expect(toWeekDay(undefined)).toBe(3);
    expect(toWeekDay('')).toBe(3);
    expect(toWeekDay(7)).toBe(3);
    expect(toWeekDay(-1)).toBe(3);
    expect(toWeekDay(2.5)).toBe(3);
    expect(toWeekDay('soon')).toBe(3);
  });
  it('names the days', () => {
    expect([0, 3, 6].map(weekdayName)).toEqual(['Sunday', 'Wednesday', 'Saturday']);
    expect(weekdayName(7)).toBe('Sunday');
  });
});
