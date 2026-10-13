import { addDays, format, getDay, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { calculatePackagePay } from '@/lib/pay-packages/engine';
import { assignmentOn, packageCovers, resolvePay, snapshotFor } from '@/lib/pay-packages/resolve';
import { buildWeekInput, type PackageContext } from '@/lib/pay-packages/generate';
import type { PayLine, PayResult } from '@/lib/pay-packages/types';

const db = supabase as any;

export interface StaffStatement {
  id: string;
  user_id: string;
  package_name: string | null;
  version_number: number | null;
  period_start: string;
  period_end: string;
  status: 'draft' | 'approved' | 'paid';
  gross_pay: number;
  non_taxable: number;
  deductions: number;
  net_pay: number;
  lines: PayLine[];
  note: string | null;
  archived_at: string | null;
  created_at: string;
}

/** Monday to Friday days in a period. Staff are paid for working days, not for loads they drove. */
export function weekdaysIn(periodStart: string, periodEnd: string): number {
  let n = 0;
  for (let d = parseISO(periodStart); format(d, 'yyyy-MM-dd') <= periodEnd; d = addDays(d, 1)) {
    const day = getDay(d);
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

/** The staff (people with a sign-in account and no driver record on the assignment) paid by a package that day. */
export function staffOnPackages(ctx: PackageContext, periodEnd: string): string[] {
  const ids = Array.from(new Set(ctx.assignments.filter((a) => !a.driver_id && a.user_id).map((a) => a.user_id as string)));
  return ids.filter((id) => {
    const hit = assignmentOn(ctx.assignments.filter((a) => !a.driver_id && a.user_id === id), periodEnd);
    return !!hit && (ctx.versionsByPackage.get(hit.package_id)?.length ?? 0) > 0;
  });
}

export interface StaffGenerationResult {
  created: number;
  skipped: Array<{ userId: string; reason: string }>;
}

/**
 * Makes a draft pay statement for each staff member from the package in force that week. Staff formulas see the
 * company's delivered loads for the period (their own pay is not tied to one truck), and "days worked" is the
 * number of working days. An existing draft is archived (kept) and replaced; approved or paid ones are left alone.
 */
export async function generateStaffStatements(args: {
  orgId: string;
  userId: string | null;
  staffIds: string[];
  periodStart: string;
  periodEnd: string;
  context: PackageContext;
}): Promise<StaffGenerationResult> {
  const { orgId, userId, staffIds, periodStart, periodEnd, context } = args;
  const skipped: StaffGenerationResult['skipped'] = [];
  let created = 0;

  const { data: loads, error: loadsError } = await db
    .from('fleet_loads')
    .select('id, pickup_date, delivery_date, booked_miles, actual_miles, gross_revenue, net_revenue, detention_hours, detention_pay, load_accessorials(amount, is_driver_pay)')
    .eq('org_id', orgId)
    .eq('status', 'delivered')
    .is('deleted_at', null)
    .gte('delivery_date', periodStart)
    .lte('delivery_date', periodEnd);
  if (loadsError) throw loadsError;
  const { count: incidents } = await db
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .gte('incident_date', periodStart)
    .lte('incident_date', periodEnd);
  const week = { ...buildWeekInput(loads ?? [], incidents ?? 0, periodStart, periodEnd), daysWorked: weekdaysIn(periodStart, periodEnd) };

  for (const staffId of staffIds) {
    const resolved = resolvePay({
      assignments: context.assignments.filter((a) => !a.driver_id && a.user_id === staffId),
      versionsByPackage: context.versionsByPackage,
      overrides: [],
      periodEnd,
    });
    if (!resolved) { skipped.push({ userId: staffId, reason: 'No pay package applies' }); continue; }
    const pkg = resolved.version.snapshot.package;
    if (!pkg.is_active || !packageCovers(pkg, periodEnd)) {
      skipped.push({ userId: staffId, reason: `${pkg.name} is not in effect for this period` });
      continue;
    }

    const { data: existing, error: existingError } = await db
      .from('staff_pay_statements')
      .select('id, status')
      .eq('org_id', orgId)
      .eq('user_id', staffId)
      .eq('period_end', periodEnd)
      .is('archived_at', null);
    if (existingError) throw existingError;
    if ((existing ?? []).some((s: { status: string }) => s.status !== 'draft')) {
      skipped.push({ userId: staffId, reason: 'Already approved or paid for this period' });
      continue;
    }

    const result: PayResult = calculatePackagePay(resolved.components, week);
    if (result.lines.length === 0 || (result.taxableGross === 0 && result.nonTaxable === 0 && result.deductions === 0)) {
      skipped.push({ userId: staffId, reason: 'The package paid nothing for this period' });
      continue;
    }

    for (const d of (existing ?? []) as Array<{ id: string }>) {
      const { error } = await db.rpc('set_staff_pay_statement_status', { _id: d.id, _action: 'archive' });
      if (error) throw error;
    }

    const snap = snapshotFor(resolved);
    const { error: insertError } = await db.from('staff_pay_statements').insert({
      org_id: orgId,
      user_id: staffId,
      package_id: snap.packageId,
      version_id: snap.versionId,
      version_number: snap.versionNumber,
      package_name: snap.packageName,
      assignment_id: snap.assignmentId,
      period_start: periodStart,
      period_end: periodEnd,
      gross_pay: result.taxableGross,
      non_taxable: result.nonTaxable,
      deductions: result.deductions,
      net_pay: result.net,
      lines: result.lines,
      snapshot: snap.snapshot,
      week,
      created_by: userId,
    });
    if (insertError) throw insertError;
    created++;
  }
  return { created, skipped };
}

export async function fetchStaffStatements(): Promise<StaffStatement[]> {
  const { data, error } = await db.from('staff_pay_statements').select('*').is('archived_at', null).order('period_end', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ ...r, gross_pay: Number(r.gross_pay), non_taxable: Number(r.non_taxable), deductions: Number(r.deductions), net_pay: Number(r.net_pay) }));
}

export async function setStatementStatus(id: string, action: 'approve' | 'pay' | 'archive' | 'restore') {
  const { error } = await db.rpc('set_staff_pay_statement_status', { _id: id, _action: action });
  if (error) throw new Error(error.message);
}

export async function fetchStaffNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db.from('profiles').select('user_id, first_name, last_name, email').in('user_id', ids);
  for (const p of (data ?? []) as any[]) map.set(p.user_id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Staff');
  return map;
}
