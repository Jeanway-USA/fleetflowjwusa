import { describe, it, expect } from 'vitest';
import { calcOverDimensionCharge, calcDetentionCharge, type OverDimRule } from './overDimension';

const RULES: OverDimRule[] = [
  { dimension: 'height', min_inches: 163, max_inches: 168, cents_per_mile: 0.75, min_charge: 250 },
  { dimension: 'height', min_inches: 169, max_inches: 174, cents_per_mile: 1.00, min_charge: 300 },
  { dimension: 'height', min_inches: 175, max_inches: 180, cents_per_mile: 1.50, min_charge: 400 },
  { dimension: 'height', min_inches: 217, max_inches: null, cents_per_mile: 10.0, min_charge: 3500 },
  { dimension: 'width',  min_inches: 103, max_inches: 108, cents_per_mile: 0.40, min_charge: 175 },
  { dimension: 'width',  min_inches: 121, max_inches: 132, cents_per_mile: 0.50, min_charge: 225 },
  { dimension: 'length', min_inches: 841, max_inches: 960, cents_per_mile: 0.30, min_charge: 175 },
];

describe('calcOverDimensionCharge (Rule 670)', () => {
  it('returns zero for a fully legal load', () => {
    const r = calcOverDimensionCharge({
      height_inches: 162, width_inches: 102, length_inches: 840, miles: 500, rules: RULES,
    });
    expect(r.charge_amount).toBe(0);
    expect(r.applied_dimension).toBeNull();
  });

  it('applies the min_charge floor when miles × cpm is below it', () => {
    // 14' tall = 168" -> 0.75/mi, min $250. 100 miles × 0.75 = $75, floor = $250.
    const r = calcOverDimensionCharge({
      height_inches: 168, miles: 100, rules: RULES,
    });
    expect(r.charge_amount).toBe(250);
    expect(r.applied_dimension).toBe('height');
  });

  it('uses cpm × miles when it exceeds the floor', () => {
    // 14' tall = 168, 500 mi × 0.75 = $375 > floor $250.
    const r = calcOverDimensionCharge({
      height_inches: 168, miles: 500, rules: RULES,
    });
    expect(r.charge_amount).toBe(375);
  });

  it('charges only the single highest dimension (Rule 670 Note 1)', () => {
    // Height 170 -> 1.00/mi × 1000 = $1000 (floor $300)
    // Width 130  -> 0.50/mi × 1000 = $500 (floor $225)
    // Length 900 -> 0.30/mi × 1000 = $300 (floor $175)
    // Winner: height $1000.
    const r = calcOverDimensionCharge({
      height_inches: 170, width_inches: 130, length_inches: 900, miles: 1000, rules: RULES,
    });
    expect(r.applied_dimension).toBe('height');
    expect(r.charge_amount).toBe(1000);
    expect(r.breakdown).toHaveLength(3);
  });

  it('still applies min_charge when miles are zero (per-load floor)', () => {
    const r = calcOverDimensionCharge({
      height_inches: 200, miles: 0, rules: RULES,
    });
    expect(r.charge_amount).toBe(3500);
  });
});

describe('calcDetentionCharge (Rule 500)', () => {
  it('returns zero for zero hours', () => {
    expect(calcDetentionCharge(0, 70, 450)).toBe(0);
  });

  it('charges hours × rate when under cap', () => {
    expect(calcDetentionCharge(3, 70, 450)).toBe(210);
  });

  it('caps at max per 24-hour day', () => {
    // 10h × $70 = $700 but cap $450/day.
    expect(calcDetentionCharge(10, 70, 450)).toBe(450);
  });

  it('extends cap per additional 24-hour day', () => {
    // 30h = 2 day-buckets, cap = 2 × 450 = 900; 30 × 70 = 2100 → capped at 900.
    expect(calcDetentionCharge(30, 70, 450)).toBe(900);
  });

  it('returns uncapped charge when cap is zero (disabled)', () => {
    expect(calcDetentionCharge(8, 50, 0)).toBe(400);
  });
});
