import { describe, expect, it } from 'vitest';
import { checkFormula, evaluateFormula } from '@/lib/pay-packages/formula';
import { applyOverrides, calculatePackagePay, settlementItemType } from '@/lib/pay-packages/engine';
import { assignmentOn, overrideFor, resolvePay, snapshotFor, versionAsOf } from '@/lib/pay-packages/resolve';
import { EMPTY_WEEK, type PayComponent, type PayPackageAssignment, type PayPackageOverride, type PayPackageVersion, type PayWeekInput } from '@/lib/pay-packages/types';

const week: PayWeekInput = {
  ...EMPTY_WEEK,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-07',
  miles: 2000,
  grossRevenue: 6000,
  netRevenue: 4000,
  loadCount: 3,
  daysWorked: 5,
  accessorials: 300,
  detentionHours: 4,
  detentionPay: 200,
  incidents: 0,
};

let order = 0;
const comp = (over: Partial<PayComponent>): PayComponent => ({
  id: `c${++order}`,
  component_type: 'base_pay',
  label: 'Pay',
  calculation_method: 'fixed_amount',
  value: 0,
  unit: 'usd',
  formula: null,
  is_taxable: true,
  is_deduction: false,
  sort_order: order,
  is_active: true,
  ...over,
});

describe('formulas', () => {
  const vars = { miles: 2000, net: 4000, incidents: 0, base: 1000 };

  it('works out arithmetic with the usual precedence', () => {
    expect(evaluateFormula('1 + 2 * 3', vars)).toBe(7);
    expect(evaluateFormula('(1 + 2) * 3', vars)).toBe(9);
    expect(evaluateFormula('net * 0.1 + miles / 100', vars)).toBe(420);
    expect(evaluateFormula('-base + 50', vars)).toBe(-950);
  });

  it('supports conditions and functions', () => {
    expect(evaluateFormula('incidents == 0 ? 150 : 0', vars)).toBe(150);
    expect(evaluateFormula('miles >= 2500 ? 100 : 0', vars)).toBe(0);
    expect(evaluateFormula('min(miles * 0.5, 800)', vars)).toBe(800);
    expect(evaluateFormula('max(0, net - 5000)', vars)).toBe(0);
    expect(evaluateFormula('if(miles > 1000 && incidents == 0, 75, 0)', vars)).toBe(75);
  });

  it('refuses anything that is not plain pay maths, and says why', () => {
    expect(checkFormula('miles *', ['miles'])).toMatch(/ends too soon/);
    expect(checkFormula('process.exit()', ['miles'])).not.toBeNull();
    expect(checkFormula('nonsense * 2', ['miles'])).toMatch(/no value called "nonsense"/);
    expect(checkFormula('miles / 0', ['miles'])).toMatch(/zero/);
    expect(checkFormula('miles * 0.5', ['miles'])).toBeNull();
    expect(checkFormula('foo(1)', [])).toMatch(/no function/);
  });
});

describe('calculatePackagePay', () => {
  it('works every method out from the week, not from any built-in rate', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 500, label: 'Base' }),
        comp({ component_type: 'mileage_bonus', calculation_method: 'per_mile', value: 0.1, label: 'Mileage' }),
        comp({ component_type: 'performance_bonus', calculation_method: 'percentage_of_net_revenue', value: 2, label: 'Net share' }),
        comp({ component_type: 'custom', calculation_method: 'percentage_of_gross', value: 1, label: 'Gross share' }),
        comp({ component_type: 'benefit', calculation_method: 'flat_daily', value: 10, label: 'Per diem', is_taxable: false }),
        comp({ component_type: 'custom', calculation_method: 'fixed_amount', value: 25, label: 'Phone' }),
      ],
      week,
    );
    expect(r.lines.map((l) => [l.label, l.amount])).toEqual([
      ['Base', 500],
      ['Mileage', 200],
      ['Net share', 80],
      ['Gross share', 60],
      ['Per diem', 50],
      ['Phone', 25],
    ]);
    expect(r.taxableGross).toBe(865);
    expect(r.nonTaxable).toBe(50);
    expect(r.net).toBe(915);
    expect(r.errors).toEqual([]);
  });

  it('subtracts deductions and keeps them as positive, flagged lines', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 1000, label: 'Base' }),
        comp({ component_type: 'advance_recovery', calculation_method: 'fixed_amount', value: 150, is_deduction: true, label: 'Advance' }),
        comp({ component_type: 'escrow_contribution', calculation_method: 'percentage_of_gross', value: 1, is_deduction: true, label: 'Escrow' }),
      ],
      week,
    );
    expect(r.lines.filter((l) => l.isDeduction).map((l) => [l.label, l.amount])).toEqual([['Advance', 150], ['Escrow', 60]]);
    expect(r.deductions).toBe(210);
    expect(r.net).toBe(790);
  });

  it('lets a formula lean on the base and earnings above it, and ignores inactive components', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 1000, label: 'Base' }),
        comp({ component_type: 'safety_bonus', calculation_method: 'formula', formula: 'incidents == 0 ? base * 0.1 : 0', label: 'Safety' }),
        comp({ component_type: 'custom', calculation_method: 'formula', formula: 'earnings * 0.05', label: 'Top-up' }),
        comp({ component_type: 'custom', calculation_method: 'fixed_amount', value: 999, label: 'Off', is_active: false }),
      ],
      week,
    );
    expect(r.lines.map((l) => [l.label, l.amount])).toEqual([['Base', 1000], ['Safety', 100], ['Top-up', 55]]);
  });

  it('pays zero and says why when a formula is broken, instead of failing the whole settlement', () => {
    const r = calculatePackagePay(
      [comp({ calculation_method: 'flat_weekly', value: 800, label: 'Base' }), comp({ calculation_method: 'formula', formula: 'miles *', label: 'Broken' })],
      week,
    );
    expect(r.lines[1]).toMatchObject({ amount: 0 });
    expect(r.errors[0]).toMatch(/Broken/);
    expect(r.taxableGross).toBe(800);
  });

  it('adds weeks for a longer period, and one-period extras', () => {
    const twoWeeks = { ...week, periodStart: '2026-09-24', periodEnd: '2026-10-07' };
    const r = calculatePackagePay([comp({ calculation_method: 'flat_weekly', value: 500, label: 'Base' })], twoWeeks, [
      { label: 'Holiday', amount: 100, is_deduction: false, is_taxable: true },
    ]);
    expect(r.lines.map((l) => [l.label, l.amount])).toEqual([['Base', 1000], ['Holiday', 100]]);
  });

  it('files each line under the settlement item type the existing totals understand', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 1, label: 'Base' }),
        comp({ component_type: 'detention', calculation_method: 'fixed_amount', value: 1, label: 'Detention' }),
        comp({ component_type: 'benefit', calculation_method: 'fixed_amount', value: 1, is_taxable: false, label: 'Benefit' }),
        comp({ component_type: 'deduction', calculation_method: 'fixed_amount', value: 1, is_deduction: true, label: 'Ded' }),
      ],
      week,
    );
    expect(r.lines.map(settlementItemType)).toEqual(['load_pay', 'accessorial', 'reimbursement', 'deduction']);
  });
});

describe('overrides', () => {
  it('changes a value, a formula or switches a component off for one period without touching the package', () => {
    const base = comp({ calculation_method: 'flat_weekly', value: 1000 });
    const bonus = comp({ component_type: 'safety_bonus', calculation_method: 'fixed_amount', value: 100 });
    const out = applyOverrides([base, bonus], [{ component_id: base.id, value: 1200 }, { component_id: bonus.id, is_active: false }]);
    expect(out[0].value).toBe(1200);
    expect(out[1].is_active).toBe(false);
    expect(base.value).toBe(1000);
    expect(bonus.is_active).toBe(true);
  });
});

describe('which package applies', () => {
  const assignment = (over: Partial<PayPackageAssignment>): PayPackageAssignment => ({ id: 'a', package_id: 'p1', driver_id: 'd', effective_start: '2026-01-01', effective_end: null, ...over });

  it('uses the assignment in force on the last day of the period, newest start first', () => {
    const list = [
      assignment({ id: 'old', package_id: 'p1', effective_start: '2026-01-01', effective_end: '2026-06-30' }),
      assignment({ id: 'new', package_id: 'p2', effective_start: '2026-07-01' }),
    ];
    expect(assignmentOn(list, '2026-06-30')?.id).toBe('old');
    expect(assignmentOn(list, '2026-10-07')?.id).toBe('new');
    expect(assignmentOn(list, '2025-12-31')).toBeNull();
  });

  const version = (n: number, created: string, value: number): PayPackageVersion => ({
    id: `v${n}`,
    package_id: 'p1',
    version_number: n,
    created_at: `${created}T12:00:00Z`,
    change_note: null,
    snapshot: { package: { id: 'p1', name: 'Standard', description: null, position_type: 'driver', is_active: true, effective_start: null, effective_end: null }, components: [comp({ calculation_method: 'flat_weekly', value })] },
  });

  it('shows a package as it stood on any past day', () => {
    const versions = [version(1, '2026-01-05', 800), version(2, '2026-06-01', 900), version(3, '2026-09-01', 1000)];
    expect(versionAsOf(versions, '2026-03-01')?.version_number).toBe(1);
    expect(versionAsOf(versions, '2026-06-01')?.version_number).toBe(2);
    expect(versionAsOf(versions, '2026-10-07')?.version_number).toBe(3);
    expect(versionAsOf(versions, '2025-12-31')).toBeNull();
  });

  it('freezes a settlement on the version in force that week, even after the package changes', () => {
    const versions = [version(1, '2026-01-05', 800), version(3, '2026-09-01', 1000)];
    const resolved = resolvePay({
      assignments: [assignment({})],
      versionsByPackage: new Map([['p1', versions]]),
      overrides: [],
      periodEnd: '2026-08-12',
    })!;
    expect(resolved.version.version_number).toBe(1);
    const snap = snapshotFor(resolved);
    expect(snap).toMatchObject({ packageName: 'Standard', versionNumber: 1, overrideId: null });
    expect(snap.snapshot.components[0].value).toBe(800);
  });

  it('finds the override whose period covers the settlement, and none otherwise', () => {
    const o: PayPackageOverride = { id: 'o1', driver_id: 'd', package_id: null, period_start: '2026-10-01', period_end: '2026-10-07', component_overrides: [], extra_lines: [], reason: 'one-off' };
    expect(overrideFor([o], '2026-10-07', 'p1')?.id).toBe('o1');
    expect(overrideFor([o], '2026-10-14', 'p1')).toBeNull();
    expect(overrideFor([{ ...o, package_id: 'other' }], '2026-10-07', 'p1')).toBeNull();
  });

  it('returns nothing when the person has no package, so the old pay settings keep working', () => {
    expect(resolvePay({ assignments: [], versionsByPackage: new Map(), overrides: [], periodEnd: '2026-10-07' })).toBeNull();
  });
});

describe('building a pay week from loads', () => {
  // Imported here so the pure helper is tested without touching the database.
  it('adds up miles, revenue and extras, and counts each day worked once', async () => {
    const { buildWeekInput } = await import('@/lib/pay-packages/generate');
    const load = (over: object) => ({
      id: 'l',
      pickup_date: '2026-10-05',
      delivery_date: '2026-10-06',
      booked_miles: 500,
      actual_miles: null,
      gross_revenue: 2000,
      net_revenue: 1600,
      detention_hours: 1,
      detention_pay: 50,
      load_accessorials: [{ amount: 100, is_driver_pay: true }, { amount: 40, is_driver_pay: false }],
      ...over,
    });
    const w = buildWeekInput(
      [load({}), load({ id: 'm', pickup_date: '2026-10-06', delivery_date: '2026-10-07', booked_miles: null, actual_miles: 300 })],
      1,
      '2026-10-01',
      '2026-10-07',
    );
    expect(w).toMatchObject({ miles: 800, grossRevenue: 4000, netRevenue: 3200, loadCount: 2, daysWorked: 3, accessorials: 200, detentionHours: 2, detentionPay: 100, incidents: 1 });
  });

  it('does not count days outside the period', async () => {
    const { buildWeekInput } = await import('@/lib/pay-packages/generate');
    const w = buildWeekInput(
      [{ id: 'l', pickup_date: '2026-09-29', delivery_date: '2026-10-02', booked_miles: 1, actual_miles: null, gross_revenue: 0, net_revenue: 0, detention_hours: 0, detention_pay: 0, load_accessorials: [] }],
      0,
      '2026-10-01',
      '2026-10-07',
    );
    expect(w.daysWorked).toBe(2);
  });
});

describe('lines that work out below zero', () => {
  it('turns a negative earning into a deduction instead of paying it as a plus', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 1700, label: 'Base' }),
        comp({ component_type: 'custom', calculation_method: 'formula', formula: 'incidents * 0 - 100', label: 'Penalty' }),
      ],
      week,
    );
    expect(r.lines[1]).toMatchObject({ label: 'Penalty', amount: 100, isDeduction: true });
    expect(r.net).toBe(1600);
  });

  it('pays back a deduction that works out below zero', () => {
    const r = calculatePackagePay(
      [
        comp({ calculation_method: 'flat_weekly', value: 1700, label: 'Base' }),
        comp({ component_type: 'deduction', is_deduction: true, calculation_method: 'formula', formula: '0 - 50', label: 'Refund' }),
      ],
      week,
    );
    expect(r.lines[1]).toMatchObject({ amount: 50, isDeduction: false });
    expect(r.net).toBe(1750);
  });
});
