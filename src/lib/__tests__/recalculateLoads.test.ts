import { describe, it, expect } from 'vitest';
import { planRecalculation, type RecalcLoad } from '@/lib/recalculate-loads';
import type { RevenueSettings } from '@/lib/revenue-calculator';

const settings: RevenueSettings = { truckPct: 0.65, trailerPct: 0.07, advancePct: 0.3, ownsTrailer: false, powerOnlyPct: 0.7 };

// Load 8357683 after it was corrected to Landstar's figures: rate 3,195.44, fuel surcharge 997.92.
const load = (o: Partial<RecalcLoad> = {}): RecalcLoad => ({
  id: 'l1', landstar_load_id: '8357683',
  rate: 3195.44, fuel_surcharge: 997.92, lumper: 0, advance_taken: 0, is_power_only: false,
  start_miles: 710883, end_miles: 712161,
  gross_revenue: 4193.36, truck_revenue: 3074.96, trailer_revenue: 0, net_revenue: 3074.96,
  settlement: 3074.96, advance_available: 1956.55, actual_miles: 1278, accessorials: 0,
  ...o,
});

describe('planRecalculation', () => {
  it('lists nothing when every load already matches the rates', () => {
    const plan = planRecalculation([load()], [], settings);
    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.revenueChange).toBe(0);
  });

  it('ignores sub-cent noise left by older calculations', () => {
    // Stored with three decimals, as the app once did: 2,149.395 against 2,149.40.
    const noisy = load({ rate: 2430.3, fuel_surcharge: 569.7, gross_revenue: 3000, truck_revenue: 2149.395, net_revenue: 2149.395, settlement: 2149.395, advance_available: 1298.79, actual_miles: 1278 });
    expect(planRecalculation([noisy], [], settings).changes).toEqual([]);
  });

  it('finds a load stored with the old $3,111.11 figure and reports the $36.15 correction', () => {
    const stale = load({ rate: 3195.44, fuel_surcharge: 997.92, truck_revenue: 3111.11, net_revenue: 3111.11, settlement: 3111.11 });
    const plan = planRecalculation([stale], [], settings);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ trip: '8357683', before: 3111.11, after: 3074.96 });
    expect(plan.revenueChange).toBeCloseTo(-36.15, 2);
  });

  it('lists every load a rate change touches, with the new and old revenue', () => {
    const plan = planRecalculation([load()], [], { ...settings, truckPct: 0.7 });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].after).toBeCloseTo(3195.44 * 0.7 + 997.92, 2);
    expect(plan.revenueChange).toBeGreaterThan(0);
  });

  it('counts an accessorial at the share you receive', () => {
    // $200 Just In Time paid at 65% is $130, so the stored $200 is wrong.
    const withJit = load({ accessorials: 200, gross_revenue: 4393.36, truck_revenue: 3274.96, net_revenue: 3274.96, settlement: 3274.96 });
    const plan = planRecalculation([withJit], [{ load_id: 'l1', amount: 200, percentage: 65 }], settings);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].patch.accessorials).toBe(130);
    expect(plan.changes[0].after).toBeCloseTo(3204.96, 2);
  });
});
