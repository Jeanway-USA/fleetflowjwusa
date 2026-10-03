import { describe, it, expect } from 'vitest';
import { calculateRevenue, type RevenueSettings } from '@/lib/revenue-calculator';
import { computeAmortization } from '@/lib/amortization';
import { reconcileRevenue, type StagedFile } from '@/lib/settlement-reconciliation';
import { calculateLoadPay, calculateWeeklyPay, payableMiles } from '@/utils/payCalculations';

const settings: RevenueSettings = { truckPct: 0.65, trailerPct: 0.07, advancePct: 0.3, ownsTrailer: false };
const baseLoad = {
  rate: 2500,
  fuel_surcharge: 700,
  lumper: 0,
  advance_taken: 0,
  is_power_only: false,
  accessorialsTotal: 0,
};

describe('calculateRevenue', () => {
  it('matches a real JeanWay load (#1456639): $2,500 × 65% + $700 FSC = $2,325', () => {
    const r = calculateRevenue(baseLoad, settings);
    expect(r.gross_revenue).toBe(3200);
    expect(r.net_revenue).toBe(2325);
    expect(r.settlement).toBe(2325);
  });

  it('does not deduct lumpers — Landstar reimburses them in full', () => {
    const r = calculateRevenue({ ...baseLoad, lumper: 350 }, settings);
    expect(r.settlement).toBe(2325);
  });

  it('still deducts fuel advances taken', () => {
    const r = calculateRevenue({ ...baseLoad, advance_taken: 500 }, settings);
    expect(r.settlement).toBe(1825);
  });

  it('rounds to whole cents (no 3868.4150000000004)', () => {
    const r = calculateRevenue({ ...baseLoad, rate: 4317.3, fuel_surcharge: 937.17 }, settings);
    expect(r.net_revenue).toBe(3743.42);
    expect(r.net_revenue.toString()).not.toMatch(/\.\d{3,}/);
  });

  it('power-only uses 70% by default and honors an override', () => {
    expect(calculateRevenue({ ...baseLoad, is_power_only: true }, settings).truck_revenue).toBe(2450);
    expect(
      calculateRevenue({ ...baseLoad, is_power_only: true }, { ...settings, powerOnlyPct: 0.72 }).truck_revenue,
    ).toBe(2500);
  });

  it('adds trailer share only when the company owns the trailer', () => {
    expect(calculateRevenue(baseLoad, { ...settings, ownsTrailer: true }).net_revenue).toBe(2500);
  });
});

describe('payableMiles / per-mile pay', () => {
  const driver = { pay_type: 'per_mile', pay_rate: 0.6 };

  it('uses booked miles when present', () => {
    expect(payableMiles({ booked_miles: 746, actual_miles: 770 })).toBe(746);
    expect(calculateLoadPay({ booked_miles: 746, actual_miles: 770 }, driver).base).toBeCloseTo(447.6);
  });

  it('falls back to actual miles instead of paying $0 when nothing was booked', () => {
    expect(calculateLoadPay({ booked_miles: null, actual_miles: 770 }, driver).base).toBeCloseTo(462);
    expect(calculateWeeklyPay({ loads: [{ booked_miles: 0, actual_miles: 100 }], driver }).totalMiles).toBe(100);
  });
});

describe('computeAmortization', () => {
  const loan = {
    principal: 100_000,
    annualRatePct: 12,
    monthlyPayment: 2224.44, // 60-month payment at 12%
    termMonths: 60,
    loanStartDate: '2026-01-01',
    today: new Date(2026, 6, 1), // 6 payments elapsed
  };

  it('on-schedule payments land on the standard amortized balance', () => {
    const a = computeAmortization({ ...loan, actualPaidToDate: 6 * 2224.44 });
    expect(a.scheduledPaymentsElapsed).toBe(6);
    // 100,000 × 1.01^6 − 2,224.44 × (1.01^6 − 1) / 0.01
    expect(a.remainingPrincipal).toBeCloseTo(92_467.23, 1);
  });

  it('an extra $5,000 comes straight off principal', () => {
    const onTime = computeAmortization({ ...loan, actualPaidToDate: 6 * 2224.44 });
    const extra = computeAmortization({ ...loan, actualPaidToDate: 6 * 2224.44 + 5000 });
    expect(onTime.remainingPrincipal - extra.remainingPrincipal).toBeCloseTo(5000, 2);
  });

  it('extra payments pull the estimated payoff date earlier', () => {
    const onTime = computeAmortization({ ...loan, actualPaidToDate: 6 * 2224.44 });
    const extra = computeAmortization({ ...loan, actualPaidToDate: 6 * 2224.44 + 20_000 });
    expect(onTime.estimatedPayoffDate!.getTime()).toBeGreaterThan(extra.estimatedPayoffDate!.getTime());
    // On schedule: 54 payments left after month 6 → Jan 2031.
    expect(onTime.estimatedPayoffDate!.getFullYear()).toBe(2031);
  });

  it('returns no payoff date when the payment does not cover interest', () => {
    const a = computeAmortization({ ...loan, monthlyPayment: 500, actualPaidToDate: 3000 });
    expect(a.estimatedPayoffDate).toBeNull();
  });
});

describe('reconcileRevenue period check', () => {
  const statement = (trips: Array<[string, number]>): StagedFile[] => [
    {
      file: {} as File,
      type: 'contractor_pdf',
      status: 'parsed',
      data: {
        statement_type: 'contractor',
        period_start: '2026-09-28',
        period_end: '2026-10-04',
        unit_number: null,
        expenses: [],
        revenue: trips.map(([trip, amt]) => ({
          date: null,
          trip_number: trip,
          flat_rate: amt,
          reimbursement_total: 0,
          description: '1099 REVENUE',
        })),
      },
    },
  ];

  it('counts a statement trip delivered just before the window instead of flagging it', () => {
    const loads = [
      { id: 'a', landstar_load_id: '9904275', origin: 'A', destination: 'B', rate: 2000, delivery_date: '2026-09-27' },
      { id: 'b', landstar_load_id: '1456639', origin: 'C', destination: 'D', rate: 2500, delivery_date: '2026-10-01' },
    ];
    const r = reconcileRevenue(statement([['9904275', 1300], ['1456639', 1625]]), loads, '2026-09-28', '2026-10-04');
    expect(r.tripMismatches).toHaveLength(0);
    expect(r.period!.expected_total).toBe(2925);
    expect(r.period!.exceedsTolerance).toBe(false);
  });
});
