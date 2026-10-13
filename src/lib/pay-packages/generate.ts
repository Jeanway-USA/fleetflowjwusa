import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { applyOverrides, calculatePackagePay, settlementItemType } from '@/lib/pay-packages/engine';
import { assignmentOn, packageCovers, resolvePay, snapshotFor } from '@/lib/pay-packages/resolve';
import { fetchAllVersions, fetchAssignments, fetchOverrides, saveSettlementSnapshot } from '@/lib/pay-packages/api';
import { EMPTY_WEEK, type PayPackageAssignment, type PayPackageOverride, type PayPackageVersion, type PayWeekInput } from '@/lib/pay-packages/types';

const db = supabase as any;

export interface PackageContext {
  assignments: PayPackageAssignment[];
  versionsByPackage: Map<string, PayPackageVersion[]>;
  overrides: PayPackageOverride[];
}

/** Loads everything needed to decide, for a set of drivers, who is paid by a package. */
export async function loadPackageContext(): Promise<PackageContext> {
  const [assignments, overrides] = await Promise.all([fetchAssignments(), fetchOverrides()]);
  const versionsByPackage = await fetchAllVersions(Array.from(new Set(assignments.map((a) => a.package_id))));
  return { assignments, versionsByPackage, overrides };
}

/** The drivers that have a package in force on the period's last day. The rest are paid the way they always were. */
export function driversOnPackages(driverIds: string[], ctx: PackageContext, periodEnd: string): Set<string> {
  const out = new Set<string>();
  for (const id of driverIds) {
    const mine = ctx.assignments.filter((a) => a.driver_id === id);
    const hit = assignmentOn(mine, periodEnd);
    if (hit && (ctx.versionsByPackage.get(hit.package_id)?.length ?? 0) > 0) out.add(id);
  }
  return out;
}

interface LoadRow {
  id: string;
  pickup_date: string | null;
  delivery_date: string | null;
  booked_miles: number | null;
  actual_miles: number | null;
  gross_revenue: number | null;
  net_revenue: number | null;
  detention_hours: number | null;
  detention_pay: number | null;
  load_accessorials: Array<{ amount: number | null; is_driver_pay: boolean | null }> | null;
}

/** What happened to one driver in one period, worked out from their delivered loads. */
export function buildWeekInput(loads: LoadRow[], incidents: number, periodStart: string, periodEnd: string): PayWeekInput {
  const days = new Set<string>();
  for (const l of loads) {
    const start = l.pickup_date ?? l.delivery_date;
    const end = l.delivery_date ?? l.pickup_date;
    if (!start || !end) continue;
    const span = differenceInCalendarDays(parseISO(end), parseISO(start));
    for (let i = 0; i <= Math.max(0, span); i++) {
      const day = format(addDays(parseISO(start), i), 'yyyy-MM-dd');
      if (day >= periodStart && day <= periodEnd) days.add(day);
    }
  }
  const n = (v: unknown) => Number(v) || 0;
  return {
    ...EMPTY_WEEK,
    periodStart,
    periodEnd,
    miles: loads.reduce((s, l) => s + (n(l.booked_miles) || n(l.actual_miles)), 0),
    grossRevenue: loads.reduce((s, l) => s + n(l.gross_revenue), 0),
    netRevenue: loads.reduce((s, l) => s + n(l.net_revenue), 0),
    loadCount: loads.length,
    daysWorked: days.size,
    accessorials: loads.reduce((s, l) => s + (l.load_accessorials ?? []).filter((a) => a.is_driver_pay !== false).reduce((t, a) => t + n(a.amount), 0), 0),
    detentionHours: loads.reduce((s, l) => s + n(l.detention_hours), 0),
    detentionPay: loads.reduce((s, l) => s + n(l.detention_pay), 0),
    incidents,
  };
}

export interface PackageGenerationResult {
  /** The settlement rows created, in the same shape the existing generator returns. */
  rows: any[];
  skipped: Array<{ driverId: string; reason: string }>;
}

/**
 * Creates a draft settlement for each driver from the package in force that week. Nothing existing is touched:
 * a driver who already has a settlement for the period is skipped, and the package and its version are frozen
 * onto the new settlement so later edits never change it.
 */
export async function generatePackageSettlements(args: {
  orgId: string;
  userId: string | null;
  driverIds: string[];
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  context: PackageContext;
  /** Archive an existing draft for the period and make a fresh one. Approved and paid settlements are never touched. */
  replaceDrafts?: boolean;
}): Promise<PackageGenerationResult> {
  const { orgId, userId, driverIds, periodStart, periodEnd, paymentDate, context, replaceDrafts = true } = args;
  const rows: any[] = [];
  const skipped: PackageGenerationResult['skipped'] = [];

  for (const driverId of driverIds) {
    const mine = context.assignments.filter((a) => a.driver_id === driverId);
    const resolved = resolvePay({
      assignments: mine,
      versionsByPackage: context.versionsByPackage,
      overrides: context.overrides.filter((o) => o.driver_id === driverId),
      periodEnd,
    });
    if (!resolved) { skipped.push({ driverId, reason: 'No pay package applies' }); continue; }
    // A package that is switched off or outside its own dates is never quietly swapped for the old pay settings.
    const pkg = resolved.version.snapshot.package;
    if (!pkg.is_active || !packageCovers(pkg, periodEnd)) {
      skipped.push({ driverId, reason: `${pkg.name} is not in effect for this period. Change its dates or assign another package.` });
      continue;
    }

    const { data: existing, error: existingError } = await db
      .from('driver_settlements')
      .select('id, status')
      .eq('org_id', orgId)
      .eq('driver_id', driverId)
      .eq('period_end', periodEnd)
      .is('deleted_at', null);
    if (existingError) throw existingError;
    const locked = (existing ?? []).filter((s: { status: string }) => s.status !== 'draft');
    if (locked.length > 0) {
      skipped.push({ driverId, reason: 'Already has an approved or paid settlement for this period.' });
      continue;
    }
    const drafts = (existing ?? []) as Array<{ id: string }>;
    if (drafts.length > 0 && !replaceDrafts) {
      skipped.push({ driverId, reason: 'Already has a draft settlement for this period.' });
      continue;
    }

    const { data: loads, error: loadsError } = await db
      .from('fleet_loads')
      .select('id, pickup_date, delivery_date, booked_miles, actual_miles, gross_revenue, net_revenue, detention_hours, detention_pay, load_accessorials(amount, is_driver_pay)')
      .eq('org_id', orgId)
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .is('deleted_at', null)
      .gte('delivery_date', periodStart)
      .lte('delivery_date', periodEnd);
    if (loadsError) throw loadsError;

    const { count: incidents } = await db
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .is('deleted_at', null)
      .gte('incident_date', periodStart)
      .lte('incident_date', periodEnd);

    const week = buildWeekInput((loads ?? []) as LoadRow[], incidents ?? 0, periodStart, periodEnd);
    const components = resolved.override ? applyOverrides(resolved.components, resolved.override.component_overrides ?? []) : resolved.components;
    const result = calculatePackagePay(components, week, resolved.override?.extra_lines ?? []);
    if (result.lines.length === 0 || (result.taxableGross === 0 && result.nonTaxable === 0 && result.deductions === 0)) {
      skipped.push({ driverId, reason: 'The package paid nothing for this period' });
      continue;
    }

    // The old draft is archived (kept, and restorable), never deleted.
    for (const d of drafts) {
      const { error: archiveError } = await db.rpc('archive_record', { _table: 'driver_settlements', _id: d.id });
      if (archiveError) throw archiveError;
    }

    const { data: settlement, error: settlementError } = await db
      .from('driver_settlements')
      .insert({
        org_id: orgId,
        driver_id: driverId,
        period_start: periodStart,
        period_end: periodEnd,
        payment_date: paymentDate,
        gross_pay: 0,
        reimbursements: 0,
        deductions: 0,
        status: 'draft',
        generated_by: userId,
        generated_at: new Date().toISOString(),
        notes: `Pay package: ${resolved.version.snapshot.package.name} (version ${resolved.version.version_number})`,
      })
      .select('*')
      .single();
    if (settlementError) throw settlementError;

    const items = result.lines
      .filter((l) => l.amount > 0)
      .map((l) => ({
        org_id: orgId,
        settlement_id: settlement.id,
        item_type: settlementItemType(l),
        description: l.label,
        amount: l.amount,
        is_escrow: l.componentType === 'escrow_contribution',
      }));
    if (items.length > 0) {
      const { error: itemsError } = await db.from('driver_settlement_items').insert(items);
      if (itemsError) throw itemsError;
    }

    // The settlement's own totals come from the same function every other settlement uses.
    const { data: totals, error: recalcError } = await db.rpc('recalc_settlement_totals', { _settlement_id: settlement.id });
    if (recalcError) throw recalcError;

    await saveSettlementSnapshot({ org_id: orgId, settlement_id: settlement.id, driver_id: driverId, snapshot: snapshotFor(resolved), result });
    rows.push(totals ?? settlement);
  }

  return { rows, skipped };
}
