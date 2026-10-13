import { describe, expect, it } from 'vitest';
import { staffOnPackages, weekdaysIn } from '@/lib/pay-packages/staff';
import { calculatePackagePay } from '@/lib/pay-packages/engine';
import { EMPTY_WEEK, type PayComponent, type PayPackageAssignment, type PayPackageVersion } from '@/lib/pay-packages/types';
import type { PackageContext } from '@/lib/pay-packages/generate';

const base1700: PayComponent = {
  id: 'b', component_type: 'base_pay', label: 'Weekly base', calculation_method: 'flat_weekly', value: 1700, unit: 'usd_per_week',
  formula: null, is_taxable: true, is_deduction: false, sort_order: 1, is_active: true,
};

describe('the $1,700 weekly base', () => {
  it('pays exactly $1,700 for one week whatever the loads were', () => {
    const quiet = calculatePackagePay([base1700], { ...EMPTY_WEEK, periodStart: '2026-10-01', periodEnd: '2026-10-07' });
    const busy = calculatePackagePay([base1700], { ...EMPTY_WEEK, periodStart: '2026-10-01', periodEnd: '2026-10-07', miles: 3200, grossRevenue: 9000, netRevenue: 7000, loadCount: 5 });
    expect(quiet.net).toBe(1700);
    expect(busy.net).toBe(1700);
  });

  it('pays $3,400 for a two-week period', () => {
    expect(calculatePackagePay([base1700], { ...EMPTY_WEEK, periodStart: '2026-09-24', periodEnd: '2026-10-07' }).net).toBe(3400);
  });
});

describe('staff pay helpers', () => {
  it('counts working days only', () => {
    expect(weekdaysIn('2026-10-05', '2026-10-11')).toBe(5); // Monday to Sunday
    expect(weekdaysIn('2026-10-03', '2026-10-09')).toBe(5); // Saturday to Friday
    expect(weekdaysIn('2026-10-10', '2026-10-11')).toBe(0); // a weekend
  });

  const version = (pkg: string): PayPackageVersion => ({
    id: `v-${pkg}`, package_id: pkg, version_number: 1, created_at: '2026-01-01T00:00:00Z', change_note: null,
    snapshot: { package: { id: pkg, name: pkg, description: null, position_type: 'dispatcher', is_active: true, effective_start: null, effective_end: null }, components: [base1700] },
  });
  const a = (over: Partial<PayPackageAssignment>): PayPackageAssignment => ({ id: 'a', package_id: 'p', driver_id: null, user_id: 'u1', effective_start: '2026-01-01', effective_end: null, ...over });

  it('lists staff with a package that day, and leaves drivers to settlements', () => {
    const ctx: PackageContext = {
      assignments: [a({ id: '1', user_id: 'u1' }), a({ id: '2', user_id: 'u2', effective_end: '2026-06-30' }), a({ id: '3', user_id: null, driver_id: 'd1' }), a({ id: '4', user_id: 'u4', package_id: 'missing' })],
      versionsByPackage: new Map([['p', [version('p')]]]),
      overrides: [],
    };
    expect(staffOnPackages(ctx, '2026-10-07')).toEqual(['u1']);
    expect(staffOnPackages(ctx, '2026-06-30').sort()).toEqual(['u1', 'u2']);
  });
});
