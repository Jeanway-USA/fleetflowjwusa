import { describe, expect, it } from 'vitest';
import { AREA_FEATURES, areaOfFeature, featureAllowed } from '@/lib/areas';
import { DEFAULT_POSITIONS } from '@/lib/positions/defaults';
import { PERMISSION_AREAS } from '@/lib/positions/types';

describe('area limits', () => {
  it('never limits anyone who has no limit', () => {
    expect(featureAllowed(null, 'payroll')).toBe(true);
    expect(featureAllowed(null, undefined)).toBe(true);
  });

  it('allows a feature only when its area is on the list', () => {
    expect(featureAllowed(['maintenance', 'fleet'], 'trucks')).toBe(true);
    expect(featureAllowed(['maintenance', 'fleet'], 'profit_loss')).toBe(false);
    expect(featureAllowed(['loads'], 'agency_loads')).toBe(true);
  });

  it('leaves pages that belong to no area alone, so a limit cannot lock someone out of the basics', () => {
    expect(areaOfFeature('something_else')).toBeNull();
    expect(featureAllowed([], 'something_else')).toBe(true);
    expect(featureAllowed([], undefined)).toBe(true);
  });

  it('puts each feature in only one area', () => {
    const all = Object.values(AREA_FEATURES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('only uses areas that the position editor offers', () => {
    const offered = new Set(PERMISSION_AREAS.map((a) => a.key));
    for (const p of DEFAULT_POSITIONS) for (const a of p.default_permissions) expect(offered.has(a)).toBe(true);
    for (const a of Object.keys(AREA_FEATURES)) expect(offered.has(a)).toBe(true);
  });
});
