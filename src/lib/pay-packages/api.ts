import { supabase } from '@/integrations/supabase/client';
import type {
  PayComponent,
  PayPackage,
  PayPackageAssignment,
  PayPackageOverride,
  PayPackageVersion,
} from '@/lib/pay-packages/types';
import type { SettlementPaySnapshot } from '@/lib/pay-packages/resolve';
import type { PayLine, PayResult } from '@/lib/pay-packages/types';

// The pay-package tables are new, so they are not in the generated database types yet.
const db = supabase as any;

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function fetchPackages(): Promise<PayPackage[]> {
  const { data, error } = await db.from('pay_packages').select('*').order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as PayPackage[];
}

export async function fetchComponents(packageId: string): Promise<PayComponent[]> {
  const { data, error } = await db
    .from('pay_package_components')
    .select('*')
    .eq('package_id', packageId)
    .is('removed_at', null)
    .order('sort_order', { ascending: true });
  fail(error);
  return ((data ?? []) as any[]).map((c) => ({ ...c, value: Number(c.value) || 0 })) as PayComponent[];
}

export async function fetchVersions(packageId: string): Promise<PayPackageVersion[]> {
  const { data, error } = await db.from('pay_package_versions').select('*').eq('package_id', packageId).order('version_number', { ascending: false });
  fail(error);
  return (data ?? []) as PayPackageVersion[];
}

/** Every version of every package a manager can see, grouped for settlement generation. */
export async function fetchAllVersions(packageIds: string[]): Promise<Map<string, PayPackageVersion[]>> {
  const map = new Map<string, PayPackageVersion[]>();
  if (packageIds.length === 0) return map;
  const { data, error } = await db.from('pay_package_versions').select('*').in('package_id', packageIds);
  fail(error);
  for (const v of (data ?? []) as PayPackageVersion[]) (map.get(v.package_id) ?? map.set(v.package_id, []).get(v.package_id)!).push(v);
  return map;
}

export type PackageDraft = Pick<PayPackage, 'name' | 'description' | 'position_type' | 'is_active' | 'effective_start' | 'effective_end'>;

/** Saves the package and all of its components in one step, and records a new version. */
export async function savePackage(packageId: string | null, pkg: PackageDraft, components: PayComponent[], note?: string): Promise<PayPackage> {
  const { data, error } = await db.rpc('save_pay_package', {
    _package_id: packageId,
    _package: pkg,
    _components: components.map((c, i) => ({
      id: /^new-/.test(c.id) ? null : c.id,
      component_type: c.component_type,
      label: c.label,
      calculation_method: c.calculation_method,
      value: c.value,
      unit: c.unit,
      formula: c.formula ?? null,
      is_taxable: c.is_taxable,
      is_deduction: c.is_deduction,
      sort_order: i + 1,
      is_active: c.is_active,
    })),
    _note: note ?? null,
  });
  fail(error);
  return data as PayPackage;
}

export async function setArchived(packageId: string, archived: boolean): Promise<PayPackage> {
  const { data, error } = await db.rpc('set_pay_package_archived', { _package_id: packageId, _archived: archived });
  fail(error);
  return data as PayPackage;
}

export async function fetchAssignments(filter: { driverId?: string; userId?: string } = {}): Promise<PayPackageAssignment[]> {
  let q = db.from('driver_pay_package_assignments').select('*').order('effective_start', { ascending: false });
  if (filter.driverId) q = q.eq('driver_id', filter.driverId);
  if (filter.userId) q = q.eq('user_id', filter.userId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []) as PayPackageAssignment[];
}

export async function assignPackage(args: { driverId: string | null; userId?: string | null; packageId: string; start: string; note?: string }) {
  const { data, error } = await db.rpc('assign_pay_package', {
    _driver_id: args.driverId,
    _user_id: args.userId ?? null,
    _package_id: args.packageId,
    _start: args.start,
    _note: args.note ?? null,
  });
  fail(error);
  return data as PayPackageAssignment;
}

/** Ends an assignment on a date. It is never deleted, so the history stays whole. */
export async function endAssignment(id: string, endDate: string) {
  const { error } = await db.from('driver_pay_package_assignments').update({ effective_end: endDate }).eq('id', id);
  fail(error);
}

export async function fetchOverrides(driverId?: string): Promise<PayPackageOverride[]> {
  let q = db.from('pay_package_overrides').select('*').is('voided_at', null).order('period_end', { ascending: false });
  if (driverId) q = q.eq('driver_id', driverId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []) as PayPackageOverride[];
}

export async function createOverride(o: Omit<PayPackageOverride, 'id' | 'created_at' | 'created_by' | 'org_id'>, orgId: string) {
  const { error } = await db.from('pay_package_overrides').insert({ ...o, org_id: orgId });
  fail(error);
}

export async function voidOverride(id: string) {
  const { error } = await db.from('pay_package_overrides').update({ voided_at: new Date().toISOString() }).eq('id', id);
  fail(error);
}

export interface StoredSnapshot {
  settlement_id: string;
  package_id: string | null;
  package_name: string | null;
  version_number: number | null;
  snapshot: SettlementPaySnapshot['snapshot'];
  lines: PayLine[];
  totals: Pick<PayResult, 'taxableGross' | 'nonTaxable' | 'deductions' | 'net'>;
  created_at: string;
}

export async function fetchSettlementSnapshot(settlementId: string): Promise<StoredSnapshot | null> {
  const { data, error } = await db.from('settlement_pay_snapshots').select('*').eq('settlement_id', settlementId).maybeSingle();
  fail(error);
  return (data ?? null) as StoredSnapshot | null;
}

export async function saveSettlementSnapshot(row: {
  org_id: string;
  settlement_id: string;
  driver_id: string;
  snapshot: SettlementPaySnapshot;
  result: PayResult;
}) {
  const { error } = await db.from('settlement_pay_snapshots').insert({
    org_id: row.org_id,
    settlement_id: row.settlement_id,
    driver_id: row.driver_id,
    package_id: row.snapshot.packageId,
    version_id: row.snapshot.versionId,
    version_number: row.snapshot.versionNumber,
    assignment_id: row.snapshot.assignmentId,
    override_id: row.snapshot.overrideId,
    package_name: row.snapshot.packageName,
    snapshot: row.snapshot.snapshot,
    lines: row.result.lines,
    totals: { taxableGross: row.result.taxableGross, nonTaxable: row.result.nonTaxable, deductions: row.result.deductions, net: row.result.net },
  });
  fail(error);
}
