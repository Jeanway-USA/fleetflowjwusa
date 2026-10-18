import { describe, expect, it } from 'vitest';
import { hourlyPay, hoursCsv, paidShiftMinutes, payWeekStart, runningClockState, summarizeWeek, toHours, type ShiftEntry } from '@/lib/shop/hours';

// Local times, so the Monday-to-Sunday week is the same in any time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const monday = new Date(2026, 9, 12); // Mon Oct 12, 2026
const now = new Date(2026, 9, 25, 12).getTime();

const shift = (id: string, start: string, end: string | null, mealMinutes = 0, userId = 'u1'): ShiftEntry => ({ id, userId, userName: 'Sam', startedAt: start, endedAt: end, mealMinutes });

describe('pay week', () => {
  it('starts on Monday, whatever day it is asked from', () => {
    for (const d of [12, 13, 15, 18]) expect(payWeekStart(new Date(2026, 9, d, 9)).getTime()).toBe(monday.getTime());
    expect(payWeekStart(new Date(2026, 9, 18, 23, 59)).getTime()).toBe(monday.getTime()); // Sunday night
    expect(payWeekStart(new Date(2026, 9, 19, 0, 1)).getTime()).toBe(new Date(2026, 9, 19).getTime()); // Monday morning
  });
});

describe('paid shift time', () => {
  it('counts the whole shift when there was no meal break', () => {
    expect(paidShiftMinutes(shift('a', at(2026, 10, 12, 7), at(2026, 10, 12, 15)), monday, now)).toBe(8 * 60);
  });

  it('pays lunch: a meal break of any length is never taken out', () => {
    for (const meal of [20, 30, 45, 90]) {
      expect(paidShiftMinutes(shift('a', at(2026, 10, 12, 7), at(2026, 10, 12, 15), meal), monday, now), `${meal} min lunch`).toBe(8 * 60);
    }
  });

  it('splits a shift that runs past Sunday midnight between the two weeks', () => {
    const s = shift('a', at(2026, 10, 18, 20), at(2026, 10, 19, 4));
    expect(paidShiftMinutes(s, monday, now)).toBe(4 * 60);
    expect(paidShiftMinutes(s, new Date(2026, 9, 19), now)).toBe(4 * 60);
  });

  it('counts a shift still running up to now', () => {
    const t = new Date(2026, 9, 12, 12).getTime();
    expect(paidShiftMinutes(shift('a', at(2026, 10, 12, 8), null), monday, t)).toBe(4 * 60);
  });
});

describe('week summary and overtime', () => {
  const fiveDays = (hoursEach: number) =>
    [12, 13, 14, 15, 16].map((d) => shift(`s${d}`, at(2026, 10, d, 6), at(2026, 10, d, 6 + hoursEach)));

  it('pays straight time up to 40 hours', () => {
    const [p] = summarizeWeek(fiveDays(8), [], monday, now);
    expect(p).toMatchObject({ regularMinutes: 2400, overtimeMinutes: 0, totalMinutes: 2400 });
  });

  it('pays hours over 40 in the week as overtime', () => {
    const [p] = summarizeWeek([...fiveDays(9), shift('sat', at(2026, 10, 17, 6), at(2026, 10, 17, 11))], [], monday, now);
    expect(toHours(p.totalMinutes)).toBe(50);
    expect(toHours(p.regularMinutes)).toBe(40);
    expect(toHours(p.overtimeMinutes)).toBe(10);
  });

  it('does not carry overtime across pay weeks', () => {
    const lastWeek = [5, 6, 7, 8, 9].map((d) => shift(`o${d}`, at(2026, 10, d, 6), at(2026, 10, d, 16)));
    const [p] = summarizeWeek([...lastWeek, shift('m', at(2026, 10, 12, 6), at(2026, 10, 12, 14))], [], monday, now);
    expect(toHours(p.totalMinutes)).toBe(8);
    expect(p.overtimeMinutes).toBe(0);
  });

  it('shows the paid time that was not on a job', () => {
    const day = shift('a', at(2026, 10, 12, 7), at(2026, 10, 12, 15));
    const timers = [{ userId: 'u1', workOrderId: 'W1', startedAt: at(2026, 10, 12, 8), endedAt: at(2026, 10, 12, 11) }, { userId: 'u1', workOrderId: 'W2', startedAt: at(2026, 10, 12, 12), endedAt: at(2026, 10, 12, 14) }];
    const [p] = summarizeWeek([day], timers, monday, now);
    expect(p.jobMinutes).toBe(5 * 60);
    expect(p.unassignedMinutes).toBe(3 * 60);
    expect(p.byJob).toEqual([{ workOrderId: 'W1', minutes: 180 }, { workOrderId: 'W2', minutes: 120 }]);
  });

  it('keeps each mechanic separate and counts entries waiting for review', () => {
    const rows = summarizeWeek([shift('a', at(2026, 10, 12, 7), at(2026, 10, 12, 15)), { ...shift('b', at(2026, 10, 12, 7), at(2026, 10, 12, 19), 0, 'u2'), userName: 'Alex', needsReview: true }], [], monday, now);
    expect(rows.map((r) => r.userName)).toEqual(['Alex', 'Sam']);
    expect(rows[0].reviewCount).toBe(1);
    expect(rows[1].reviewCount).toBe(0);
  });
});

describe('running clock safeguards', () => {
  it('is fine under 10 hours, warns from 10, and is stopped at 12', () => {
    const start = new Date(2026, 9, 12, 6).getTime();
    const state = (h: number) => runningClockState(new Date(start).toISOString(), start + h * 3_600_000);
    expect(state(9.9)).toBe('ok');
    expect(state(10)).toBe('warn');
    expect(state(11.9)).toBe('warn');
    expect(state(12)).toBe('stopped');
  });
});

describe('hourly pay', () => {
  it('pays 1.5 times the rate for overtime hours', () => {
    expect(hourlyPay(30, 2400, 600)).toEqual({ regularHours: 40, overtimeHours: 10, regularPay: 1200, overtimePay: 450, total: 1650 });
  });

  it('pays on hours rounded to hundredths, to the cent', () => {
    expect(hourlyPay(27.55, 2005, 0).regularPay).toBe(920.72);
  });
});

describe('hours export', () => {
  it('writes one quoted row per mechanic', () => {
    const [p] = summarizeWeek([shift('a', at(2026, 10, 12, 7), at(2026, 10, 12, 15))], [], monday, now);
    const csv = hoursCsv([{ ...p, userName: 'Sam "SJ" Jones' }], monday).split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[1]).toContain('"Sam ""SJ"" Jones"');
    expect(csv[1]).toContain('"8"');
  });
});

import { isWholePayWeeks, periodPaidHours } from '@/lib/shop/hours';

describe('hourly pay periods', () => {
  it('accepts whole Monday-to-Sunday weeks only', () => {
    expect(isWholePayWeeks('2026-10-12', '2026-10-18')).toBe(true);
    expect(isWholePayWeeks('2026-10-12', '2026-10-25')).toBe(true);
    expect(isWholePayWeeks('2026-10-13', '2026-10-19')).toBe(false);
    expect(isWholePayWeeks('2026-10-12', '2026-10-17')).toBe(false);
    expect(isWholePayWeeks('2026-10-12', '2026-10-11')).toBe(false);
  });

  it('works out overtime week by week across a two-week period', () => {
    const wk1 = [12, 13, 14, 15, 16].map((d) => shift(`a${d}`, at(2026, 10, d, 6), at(2026, 10, d, 16))); // 50h
    const wk2 = [19, 20, 21].map((d) => shift(`b${d}`, at(2026, 10, d, 6), at(2026, 10, d, 14))); // 24h
    const r = periodPaidHours([...wk1, ...wk2], 'u1', '2026-10-12', '2026-10-25', now);
    expect(r).toEqual({ regularHours: 64, overtimeHours: 10, reviewCount: 0 });
  });

  it('counts only the one person and flags entries waiting for review', () => {
    const r = periodPaidHours([shift('a', at(2026, 10, 12, 6), at(2026, 10, 12, 14)), { ...shift('b', at(2026, 10, 13, 6), at(2026, 10, 13, 18)), needsReview: true }, shift('c', at(2026, 10, 12, 6), at(2026, 10, 12, 14), 0, 'u2')], 'u1', '2026-10-12', '2026-10-18', now);
    expect(r.regularHours).toBe(20);
    expect(r.reviewCount).toBe(1);
  });
});
