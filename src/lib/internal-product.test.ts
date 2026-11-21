import { describe, expect, it } from 'vitest';
import { isInternalProduct, tierAllows, INTERNAL_PRODUCT } from './internal-product';

describe('internal product switch', () => {
  it('is on for this deployment whatever the org flag says', () => {
    expect(INTERNAL_PRODUCT).toBe(true);
    expect(isInternalProduct(false)).toBe(true);
    expect(isInternalProduct(undefined)).toBe(true);
    expect(isInternalProduct(true)).toBe(true);
  });

  it('never locks a feature behind a tier when internal', () => {
    expect(tierAllows(true, new Set(['loads']), 'payroll')).toBe(true);
  });

  it('keeps the tier table for a non-internal caller', () => {
    expect(tierAllows(false, new Set(['loads']), 'payroll')).toBe(false);
    expect(tierAllows(false, new Set(['loads']), 'loads')).toBe(true);
    expect(tierAllows(false, new Set(), undefined)).toBe(true);
  });
});
