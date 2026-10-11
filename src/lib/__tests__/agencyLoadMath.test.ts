import { describe, expect, it } from 'vitest';
import { bcoPayout, landstarBilled, marginPercent, summarizeAgencyLoads } from '@/lib/agency-load-math';

describe('agency load money', () => {
  const load = { broker_rate: 2000, carrier_rate: 1700, margin: 300, gross_linehaul: 1000, fuel_surcharge: 200, tarp_fee: 50, bco_split_pct: 70, status: 'booked' };

  it('pays the split on linehaul only and passes fuel and tarp through', () => {
    expect(bcoPayout(load)).toBe(950); // 1000 x 70% + 200 + 50
    expect(landstarBilled(load)).toBe(1250);
  });

  it('falls back to a 72 percent split when none is set', () => {
    expect(bcoPayout({ gross_linehaul: 1000, bco_split_pct: null })).toBe(720);
  });

  it('works margin as a percent of the broker rate, and not at all without one', () => {
    expect(marginPercent(load)).toBe(15);
    expect(marginPercent({ margin: 100, broker_rate: 0 })).toBeNull();
  });

  it('totals the loads shown and ignores cancelled ones', () => {
    const t = summarizeAgencyLoads([load, { ...load, status: 'delivered' }, { ...load, status: 'cancelled' }]);
    expect(t).toEqual({ loads: 2, open: 1, brokerPays: 4000, carrierCost: 3400, margin: 600, bcoPayout: 1900 });
  });
});
