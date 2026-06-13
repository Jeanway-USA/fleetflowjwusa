import { describe, it, expect } from 'vitest';
import {
  calculateLoadPay,
  calculateWeeklyPay,
  normalizePayType,
  sumAccessorials,
} from './payCalculations';

const load = (over: Partial<Parameters<typeof calculateLoadPay>[0]> = {}) => ({
  rate: 2000,
  fuel_surcharge: 300,
  booked_miles: 1000,
  load_accessorials: [{ amount: 50 }, { amount: 25 }],
  ...over,
});

describe('normalizePayType', () => {
  it('aliases cpm to per_mile', () => {
    expect(normalizePayType('cpm')).toBe('per_mile');
    expect(normalizePayType('per_mile')).toBe('per_mile');
  });
  it('handles unknown', () => {
    expect(normalizePayType('weird')).toBe('unknown');
    expect(normalizePayType(null)).toBe('unknown');
  });
});

describe('sumAccessorials', () => {
  it('handles nulls and missing arrays', () => {
    expect(sumAccessorials(null)).toBe(0);
    expect(sumAccessorials({ load_accessorials: null })).toBe(0);
    expect(sumAccessorials({ load_accessorials: [{ amount: 10 }, { amount: null }] })).toBe(10);
  });

  it('excludes accessorials flagged as company-pay', () => {
    const result = sumAccessorials({
      load_accessorials: [
        { amount: 100, is_driver_pay: true },
        { amount: 75, is_driver_pay: false },
      ],
    });
    expect(result).toBe(100);
  });

  it('includes legacy rows without the flag (defaults to driver pay)', () => {
    expect(
      sumAccessorials({
        load_accessorials: [{ amount: 40 }, { amount: 60, is_driver_pay: null }],
      }),
    ).toBe(100);
  });

  it('feeds calculateLoadPay so company accessorials are excluded from driver pay', () => {
    const r = calculateLoadPay(
      {
        rate: 0,
        booked_miles: 100,
        load_accessorials: [
          { amount: 100, is_driver_pay: true },
          { amount: 75, is_driver_pay: false },
        ],
      },
      { pay_type: 'per_mile', pay_rate: 0.5 },
    );
    expect(r.accessorialsTotal).toBe(100);
    expect(r.total).toBeCloseTo(50 + 100);
  });
});

describe('percentage pay', () => {
  const driver = { pay_type: 'percentage' as const, pay_rate: 70 };

  it('applies 0.65 Landstar split by default and excludes FSC', () => {
    const r = calculateLoadPay(load(), driver, { tmsMode: 'landstar' });
    // 2000 * 0.65 * 0.70 = 910 ; + 75 accessorials = 985
    expect(r.base).toBeCloseTo(910);
    expect(r.accessorialsTotal).toBe(75);
    expect(r.total).toBeCloseTo(985);
  });

  it('skips the split in independent mode', () => {
    const r = calculateLoadPay(load(), driver, { tmsMode: 'independent' });
    // 2000 * 1 * 0.70 = 1400 ; + 75 = 1475
    expect(r.total).toBeCloseTo(1475);
  });

  it('honors configurable split', () => {
    const r = calculateLoadPay(load(), driver, { tmsMode: 'landstar', landstarSplit: 0.72 });
    // 2000 * 0.72 * 0.70 = 1008 + 75 = 1083
    expect(r.total).toBeCloseTo(1083);
  });
});

describe('per_mile pay', () => {
  it('multiplies booked miles by rate and adds accessorials', () => {
    const r = calculateLoadPay(load(), { pay_type: 'per_mile', pay_rate: 0.65 });
    expect(r.total).toBeCloseTo(1000 * 0.65 + 75);
  });
  it('treats cpm as alias', () => {
    const r = calculateLoadPay(load(), { pay_type: 'cpm', pay_rate: 0.5 });
    expect(r.total).toBeCloseTo(500 + 75);
  });
});

describe('flat pay', () => {
  it('per-load returns only accessorials', () => {
    const r = calculateLoadPay(load(), { pay_type: 'flat', pay_rate: 1500 });
    expect(r.base).toBe(0);
    expect(r.total).toBe(75);
  });
  it('weekly sums flat + accessorials across loads', () => {
    const r = calculateWeeklyPay({
      loads: [load(), load({ load_accessorials: [{ amount: 100 }] })],
      driver: { pay_type: 'flat', pay_rate: 1500 },
    });
    expect(r.base).toBe(1500);
    expect(r.accessorialsTotal).toBe(75 + 100);
    expect(r.total).toBe(1500 + 175);
  });
});

describe('hourly pay', () => {
  it('weekly = hours * rate + accessorials', () => {
    const r = calculateWeeklyPay({
      loads: [load()],
      driver: { pay_type: 'hourly', pay_rate: 25 },
      hoursWorked: 40,
    });
    expect(r.base).toBe(1000);
    expect(r.total).toBe(1000 + 75);
  });
});

describe('NaN / null safety', () => {
  it('returns zeros for missing inputs', () => {
    const r = calculateLoadPay(null, null);
    expect(r.total).toBe(0);
  });
  it('coerces null rate and miles', () => {
    const r = calculateLoadPay(
      { rate: null, booked_miles: null, load_accessorials: null },
      { pay_type: 'percentage', pay_rate: 70 },
      { tmsMode: 'landstar' },
    );
    expect(r.total).toBe(0);
  });
});

describe('weekly aggregation for percentage', () => {
  it('sums per-load bases and accessorials once', () => {
    const r = calculateWeeklyPay({
      loads: [load(), load({ rate: 1000, load_accessorials: [] })],
      driver: { pay_type: 'percentage', pay_rate: 70 },
      settings: { tmsMode: 'landstar' },
    });
    // L1 base: 2000*0.65*0.7 = 910 ; L2 base: 1000*0.65*0.7 = 455
    expect(r.base).toBeCloseTo(910 + 455);
    expect(r.accessorialsTotal).toBe(75);
    expect(r.total).toBeCloseTo(910 + 455 + 75);
  });
});
