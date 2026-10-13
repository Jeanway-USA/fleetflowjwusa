import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { todayLocal, toLocalIso } from '@/lib/datetime';

afterEach(() => vi.useRealTimers());

describe('local dates', () => {
  it('says today is today late in the evening, not tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 21, 30)); // Oct 12, 9:30 pm in the viewer's own zone
    expect(todayLocal()).toBe('2026-10-12');
    expect(todayLocal()).toBe(format(new Date(), 'yyyy-MM-dd'));
  });

  it('keeps the last day of a week as the last day of the week', () => {
    const end = endOfWeek(new Date(2026, 9, 12), { weekStartsOn: 0 }); // Saturday 23:59:59 local
    expect(toLocalIso(end)).toBe('2026-10-17');
    expect(toLocalIso(startOfWeek(new Date(2026, 9, 12), { weekStartsOn: 0 }))).toBe('2026-10-11');
  });

  it('reads a date-only value as that same calendar day', () => {
    expect(format(parseISO('2026-10-12'), 'yyyy-MM-dd')).toBe('2026-10-12');
    expect(parseISO('2026-10-12').getDate()).toBe(12);
  });
});
