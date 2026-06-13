import { describe, it, expect } from 'vitest';
import { calcOverDimensionCharge, type OverDimRule } from './overDimension';

const RULES: OverDimRule[] = [
  { dimension: 'height', min_inches: 163, max_inches: 168, cents_per_mile: 0.10 },
  { dimension: 'height', min_inches: 169, max_inches: 174, cents_per_mile: 0.20 },
  { dimension: 'height', min_inches: 175, max_inches: 180, cents_per_mile: 0.40 },
  { dimension: 'height', min_inches: 181, max_inches: null, cents_per_mile: 0.75 },
  { dimension: 'width',  min_inches: 103, max_inches: 120, cents_per_mile: 0.10 },
  { dimension: 'width',  min_inches: 121, max_inches: 144, cents_per_mile: 0.20 },
  { dimension: 'length', min_inches: 841, max_inches: 1020, cents_per_mile: 0.10 },
];

describe('calcOverDimensionCharge', () => {
  it('returns zero charge for a fully legal load', () => {
    const r = calcOverDimensionCharge({
      height_inches: 162, width_inches: 102, length_inches: 840, miles: 500, rules: RULES,
    });
    expect(r.charge_amount).toBe(0);
    expect(r.total_cpm).toBe(0);
    expect(r.breakdown).toEqual([]);
  });

  it('applies the first height band (14\' tall) × 500 miles = $50', () => {
    const r = calcOverDimensionCharge({
      height_inches: 14 * 12, width_inches: 102, length_inches: 840, miles: 500, rules: RULES,
    });
    expect(r.height_cpm).toBe(0.10);
    expect(r.charge_amount).toBe(50);
  });

  it('stacks CPM across multiple over-dim dimensions', () => {
    const r = calcOverDimensionCharge({
      height_inches: 170, width_inches: 130, length_inches: 900, miles: 1000, rules: RULES,
    });
    // 0.20 (H) + 0.20 (W) + 0.10 (L) = 0.50 * 1000 = 500
    expect(r.total_cpm).toBeCloseTo(0.50, 4);
    expect(r.charge_amount).toBe(500);
    expect(r.breakdown).toHaveLength(3);
  });

  it('returns zero charge when miles are missing', () => {
    const r = calcOverDimensionCharge({
      height_inches: 200, width_inches: 200, length_inches: 1500, miles: 0, rules: RULES,
    });
    expect(r.charge_amount).toBe(0);
  });

  it('uses the highest band for the value (>15\' goes to $0.75)', () => {
    const r = calcOverDimensionCharge({
      height_inches: 200, miles: 100, rules: RULES,
    });
    expect(r.height_cpm).toBe(0.75);
    expect(r.charge_amount).toBe(75);
  });
});
