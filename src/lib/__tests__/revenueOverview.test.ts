import { describe, expect, it } from 'vitest';
import { bySeries, compare, periodKey, periodLabel, summarize, yearToDatePair, type OverviewLoad } from '@/lib/revenue-overview';

const load = (over: Partial<OverviewLoad>): OverviewLoad => ({
  delivery_date: '2026-10-01', gross_revenue: 3000, net_revenue: 2300, fuel_surcharge: 700, accessorials: 100, booked_miles: 1000, truck_id: 'T1', ...over,
});

describe('summarize', () => {
  it('splits what customers were billed into your share and Landstar\'s cut, and rates it per billed mile', () => {
    const r = summarize([load({}), load({ gross_revenue: 1500, net_revenue: 1200, fuel_surcharge: 300, accessorials: 0, booked_miles: 500 })]);
    expect(r).toMatchObject({ shipments: 2, gross: 4500, yours: 3500, landstarCut: 1000, fuelSurcharge: 1000, accessorials: 100, linehaul: 2400, billedMiles: 1500, tractors: 1 });
    expect(r.allInRate).toBe(3); // 4500 / 1500
    expect(r.netRate).toBe(2.33); // 3500 / 1500
  });

  it('never lets the gross fall below what you were paid', () => {
    expect(summarize([load({ gross_revenue: 0 })]).gross).toBe(2300);
  });

  it('handles no loads', () => {
    expect(summarize([])).toMatchObject({ shipments: 0, gross: 0, allInRate: 0, netRate: 0 });
  });
});

describe('periods', () => {
  it('puts a load on the Wednesday that ends its settlement week', () => {
    expect(periodKey('2026-10-01', 'week')).toBe('2026-10-07'); // Thursday
    expect(periodKey('2026-10-07', 'week')).toBe('2026-10-07'); // Wednesday
    expect(periodKey('2026-10-08', 'week')).toBe('2026-10-14'); // next Thursday
    expect(periodKey('2026-10-07', 'month')).toBe('2026-10');
    expect(periodKey('2026-10-07', 'quarter')).toBe('2026-Q4');
    expect(periodKey('2026-03-31', 'quarter')).toBe('2026-Q1');
  });

  it('labels periods for people', () => {
    expect(periodLabel('2026-10-07', 'week')).toBe('Week ending Oct 7');
    expect(periodLabel('2026-10', 'month')).toBe('October');
    expect(periodLabel('2026-Q4', 'quarter')).toBe('2026 Q4');
  });

  it('builds a series in date order', () => {
    const rows = bySeries([load({ delivery_date: '2026-10-08' }), load({ delivery_date: '2026-10-01' }), load({ delivery_date: '2026-10-02' })], 'week');
    expect(rows.map((r) => [r.key, r.shipments])).toEqual([['2026-10-07', 2], ['2026-10-14', 1]]);
  });
});

describe('year over year', () => {
  const all = [
    load({ delivery_date: '2026-03-01' }), load({ delivery_date: '2026-10-01' }), load({ delivery_date: '2026-12-20' }),
    load({ delivery_date: '2025-03-01' }), load({ delivery_date: '2025-11-01' }),
  ];

  it('compares this year to date with the same stretch of last year', () => {
    const { current, previous } = yearToDatePair(all, 2026, new Date(2026, 9, 7));
    expect(current.shipments).toBe(2); // Dec 20 is still ahead
    expect(previous.shipments).toBe(1); // Nov 1, 2025 is past the same point last year
  });

  it('compares a finished year with the whole year before it', () => {
    const { current, previous } = yearToDatePair(all, 2025, new Date(2026, 9, 7));
    expect(current.shipments).toBe(2);
    expect(previous.shipments).toBe(0);
  });

  it('gives a percent change, or none when there was nothing before', () => {
    expect(compare(150, 100)).toEqual({ current: 150, previous: 100, change: 50, percent: 50 });
    expect(compare(150, 0).percent).toBeNull();
  });
});
