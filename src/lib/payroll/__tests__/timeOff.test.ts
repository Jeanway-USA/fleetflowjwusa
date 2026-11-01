import { describe, expect, it } from 'vitest';
import { balanceOn, canTake, leavePay, sickAccrual, sickUsableFrom, type TimeOffEntry } from '@/lib/payroll/timeOff';

const e = (date: string, hours: number, type: TimeOffEntry['entry_type'] = 'accrual', kind: TimeOffEntry['kind'] = 'sick'): TimeOffEntry => ({ id: `${date}${hours}`, kind, entry_type: type, hours, effective_date: date });

describe('sick leave earned', () => {
  it('is one hour for every 40 worked', () => {
    expect(sickAccrual(40)).toBe(1);
    expect(sickAccrual(12)).toBe(0.3);
    expect(sickAccrual(46)).toBe(1.15);
    expect(sickAccrual(0)).toBe(0);
  });
  it('can be used 90 days after the hire date', () => {
    expect(sickUsableFrom('2026-01-01')).toBe('2026-04-01');
    expect(sickUsableFrom('2026-10-01')).toBe('2026-12-30');
    expect(sickUsableFrom(null)).toBeNull();
  });
});

describe('balances from the ledger', () => {
  it('adds earned hours and takes off used hours', () => {
    const b = balanceOn([e('2026-03-01', 1), e('2026-03-08', 1), e('2026-04-01', -1.5, 'use')], 'sick', '2026-06-30');
    expect(b).toMatchObject({ available: 0.5, earnedThisYear: 2, usedThisYear: 1.5, carriedIn: 0 });
  });
  it('ignores entries after the date', () => {
    expect(balanceOn([e('2026-03-01', 1), e('2026-09-01', 5)], 'sick', '2026-06-30').available).toBe(1);
  });
  it('carries over at most 40 hours into the next year and drops the rest', () => {
    const b = balanceOn([e('2025-06-01', 52)], 'sick', '2026-02-01');
    expect(b).toMatchObject({ available: 40, carriedIn: 40, lostAtYearStart: 12 });
  });
  it('carries a small balance over in full and adds the new year on top', () => {
    const b = balanceOn([e('2025-06-01', 10), e('2026-01-10', 2)], 'sick', '2026-03-01');
    expect(b).toMatchObject({ available: 12, carriedIn: 10, earnedThisYear: 2, lostAtYearStart: 0 });
  });
  it('carries through a year with no entries', () => {
    expect(balanceOn([e('2024-06-01', 30)], 'sick', '2026-06-01').available).toBe(30);
  });
  it('does not cap other kinds of leave', () => {
    expect(balanceOn([e('2025-06-01', 80, 'accrual', 'pto')], 'pto', '2026-02-01').available).toBe(80);
  });
  it('keeps kinds separate', () => {
    expect(balanceOn([e('2026-03-01', 4, 'adjustment', 'pto')], 'sick', '2026-06-01').available).toBe(0);
  });
});

describe('taking leave', () => {
  it('needs the 90 days and enough hours for sick leave', () => {
    expect(canTake({ kind: 'sick', hours: 4, date: '2026-03-01', hireDate: '2026-01-15', available: 10 })).toMatchObject({ ok: false });
    expect(canTake({ kind: 'sick', hours: 4, date: '2026-05-01', hireDate: '2026-01-15', available: 3 })).toMatchObject({ ok: false });
    expect(canTake({ kind: 'sick', hours: 4, date: '2026-05-01', hireDate: '2026-01-15', available: 4 })).toEqual({ ok: true });
  });
  it('PTO has no waiting period', () => {
    expect(canTake({ kind: 'pto', hours: 8, date: '2026-01-20', hireDate: '2026-01-15', available: 8 })).toEqual({ ok: true });
  });
  it('is paid at the hourly rate', () => {
    expect(leavePay(6, 17.13)).toBe(102.78);
  });
});
