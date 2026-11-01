import { addDays, format, getDay, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { calculatePackagePay } from '@/lib/pay-packages/engine';
import { assignmentOn, packageCovers, resolvePay, snapshotFor } from '@/lib/pay-packages/resolve';
import { buildWeekInput, type PackageContext } from '@/lib/pay-packages/generate';
import type { PayLine, PayResult } from '@/lib/pay-packages/types';
import { isWholePayWeeks, periodPaidHours, type ShiftEntry } from '@/lib/shop/hours';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { employeeForUser, loadStaffTaxContext, staffTaxesFor, staffYtd } from '@/lib/payroll/staffTax';
import { loadPlansFor, recordApplied } from '@/lib/payroll/deductionPlans';
import { wageIssues } from '@/lib/payroll/compliance';
import { balanceOn, leavePay, sickAccrual } from '@/lib/payroll/timeOff';
import { fetchEntries, KIND_LABEL, recordAccrual } from '@/lib/payroll/timeOffStore';

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
  /** Federal, state and payroll taxes withheld. Zero on statements made before staff taxes were added. */
  tax_withholding: number;
  net_pay: number;
  lines: PayLine[];
  tax_calculation?: { lines?: Array<{ key: string; label: string; amount: number; side: 'employee' | 'employer'; note?: string }>; profile?: { usedDefaults?: boolean } } | null;
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
  /** Things to look at, such as a person with no W-4 on file. */
  warnings: Array<{ userId: string; message: string }>;
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
  /** The payday, which standing deductions are dated against. Defaults to the end of the period. */
  payDate?: string;
}): Promise<StaffGenerationResult> {
  const { orgId, userId, staffIds, periodStart, periodEnd, context } = args;
  const payDate = args.payDate ?? periodEnd;
  const skipped: StaffGenerationResult['skipped'] = [];
  const warnings: StaffGenerationResult['warnings'] = [];
  let created = 0;
  const taxCtx = await loadStaffTaxContext(orgId);
  const taxConfig = defaultTaxYearConfig(Number(periodEnd.slice(0, 4)));

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

  const shifts = await fetchShifts(periodStart, periodEnd);

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

    // Hourly pay comes from the shift clock. It needs whole pay weeks, and every clock entry checked.
    const hourly = resolved.components.some((c) => c.is_active && (c.calculation_method === 'per_hour' || c.calculation_method === 'overtime_hour' || /\bhours\b|regular_hours|overtime_hours/.test(c.formula ?? '')));
    let staffWeek = week;
    if (hourly) {
      if (!isWholePayWeeks(periodStart, periodEnd)) { skipped.push({ userId: staffId, reason: 'Hourly pay needs a period of whole Monday to Sunday weeks' }); continue; }
      const paid = periodPaidHours(shifts, staffId, periodStart, periodEnd, Date.now());
      if (paid.reviewCount > 0) { skipped.push({ userId: staffId, reason: `${paid.reviewCount} clock ${paid.reviewCount === 1 ? 'entry needs' : 'entries need'} review in the hours report first` }); continue; }
      staffWeek = { ...week, regularHours: paid.regularHours, overtimeHours: paid.overtimeHours };
    }

    const result: PayResult = calculatePackagePay(resolved.components, staffWeek);
    if (result.lines.length === 0 || (result.taxableGross === 0 && result.nonTaxable === 0 && result.deductions === 0)) {
      skipped.push({ userId: staffId, reason: 'The package paid nothing for this period' });
      continue;
    }

    // Wage law: hours worked must be paid, overtime must be paid, and the pay must reach the minimum wage.
    const hoursWorked = (staffWeek.regularHours ?? 0) + (staffWeek.overtimeHours ?? 0);
    if (hourly && hoursWorked > 0) {
      const live = resolved.components.filter((c) => c.is_active);
      const rateLine = live.find((c) => c.calculation_method === 'per_hour');
      const wage = wageIssues({
        state: employeeForUser(taxCtx, staffId)?.profile.workState,
        date: periodEnd,
        regularHours: staffWeek.regularHours ?? 0,
        overtimeHours: staffWeek.overtimeHours ?? 0,
        // Hourly pay worked out by a formula has no single rate: the average for the hours is checked instead.
        hourlyRate: rateLine ? rateLine.value : live.some((c) => c.calculation_method === 'overtime_hour') ? null : result.taxableGross / hoursWorked,
        hasOvertimePay: live.some((c) => c.calculation_method === 'overtime_hour') || live.some((c) => c.calculation_method === 'formula' && /overtime_hours/.test(c.formula ?? '')),
        taxableGross: result.taxableGross,
      });
      const blocking = wage.filter((w) => w.level === 'block');
      if (blocking.length > 0) { skipped.push({ userId: staffId, reason: blocking.map((w) => w.message).join(' ') }); continue; }
    }

    for (const d of (existing ?? []) as Array<{ id: string }>) {
      const { error } = await db.rpc('set_staff_pay_statement_status', { _id: d.id, _action: 'archive' });
      if (error) throw error;
    }

    // Paid leave taken in this period is paid at the hourly rate. Sick leave is earned from hours worked (Washington).
    const payee = employeeForUser(taxCtx, staffId);
    const leaveEntries = await fetchEntries(orgId, staffId);
    const taken = leaveEntries.filter((e) => e.entry_type === 'use' && e.effective_date >= periodStart && e.effective_date <= periodEnd);
    const liveComponents = resolved.components.filter((c) => c.is_active);
    const hourlyRate = liveComponents.find((c) => c.calculation_method === 'per_hour')?.value ?? null;
    const leaveLines: PayLine[] = [];
    (['sick', 'pto', 'holiday'] as const).forEach((kind, idx) => {
      const hrs = Math.round(-taken.filter((e) => e.kind === kind).reduce((s, e) => s + e.hours, 0) * 100) / 100;
      if (hrs <= 0) return;
      if (hourlyRate == null) { warnings.push({ userId: staffId, message: `${KIND_LABEL[kind]} of ${hrs} hours was NOT paid: the pay package has no hourly rate to pay it at.` }); return; }
      leaveLines.push({ componentId: `leave:${kind}`, componentType: 'custom', label: KIND_LABEL[kind], method: 'extra', amount: leavePay(hrs, hourlyRate), isDeduction: false, isTaxable: true, detail: `${hrs} hours at ${hourlyRate.toFixed(2)} an hour`, sortOrder: 900 + idx });
    });
    const leaveTotal = Math.round(leaveLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const taxableTotal = Math.round((result.taxableGross + leaveTotal) * 100) / 100;
    const earnsSick = (payee?.profile.workState ?? '').toUpperCase() === 'WA' && hoursWorked > 0;
    const sickEarned = earnsSick ? sickAccrual(hoursWorked) : 0;
    const sickUsed = Math.round(-taken.filter((e) => e.kind === 'sick').reduce((s, e) => s + e.hours, 0) * 100) / 100;
    const sickBalance = earnsSick || leaveEntries.some((e) => e.kind === 'sick')
      ? balanceOn([...leaveEntries, { id: 'new', kind: 'sick', entry_type: 'accrual', hours: sickEarned, effective_date: periodEnd }], 'sick', periodEnd).available
      : null;

    // Taxes come off the pay, from the person's own W-4 and state form.
    const ytd = await staffYtd(orgId, staffId, Number(periodEnd.slice(0, 4)), periodEnd);
    const taxes = staffTaxesFor({ payee, taxableGross: taxableTotal, nonTaxable: result.nonTaxable, deductions: result.deductions, config: taxConfig, ctx: taxCtx, ytd, plans: payee ? (await loadPlansFor(orgId, 'employee', [payee.id], Number(periodEnd.slice(0, 4)))).get(payee.id) ?? [] : [], payDate });
    for (const message of taxes.warnings) warnings.push({ userId: staffId, message });
    // Standing deductions (insurance, 401(k), garnishments, loans) join the package's own lines.
    const planLines: PayLine[] = taxes.applied.map((a, idx) => ({
      componentId: `plan:${a.planId}`, componentType: 'deduction' as PayLine['componentType'], label: a.label, method: 'extra', amount: a.amount, isDeduction: true, isTaxable: false,
      detail: `${a.preTax ? 'Taken before tax' : 'Taken after tax'}${a.note ? `. ${a.note}` : ''}`, sortOrder: 1000 + idx,
    }));

    const calculation = sickBalance == null ? taxes.calculation : { ...(taxes.calculation as object), timeOff: { sick: { available: sickBalance, earned: sickEarned, used: sickUsed } } };
    const snap = snapshotFor(resolved);
    const { data: inserted, error: insertError } = await db.from('staff_pay_statements').insert({
      org_id: orgId,
      user_id: staffId,
      package_id: snap.packageId,
      version_id: snap.versionId,
      version_number: snap.versionNumber,
      package_name: snap.packageName,
      assignment_id: snap.assignmentId,
      period_start: periodStart,
      period_end: periodEnd,
      gross_pay: taxableTotal,
      non_taxable: result.nonTaxable,
      deductions: Math.round((result.deductions + taxes.planTotal) * 100) / 100,
      tax_withholding: taxes.taxWithholding,
      tax_calculation: calculation,
      net_pay: taxes.netPay,
      lines: [...result.lines, ...leaveLines, ...planLines],
      snapshot: snap.snapshot,
      week: staffWeek,
      created_by: userId,
    }).select('id').single();
    if (insertError) throw insertError;
    if (inserted?.id && sickEarned > 0) await recordAccrual({ orgId, userId: staffId, statementId: inserted.id, kind: 'sick', hours: sickEarned, periodEnd, note: `Earned from ${hoursWorked} hours worked` });
    if (inserted?.id) await recordApplied({ orgId, source: 'staff_statement', sourceId: inserted.id, payDate, applied: taxes.applied });
    created++;
  }
  return { created, skipped, warnings };
}

/** Finished shifts in a period, for hourly pay. An entry still running is left out: it is not finished yet. */
async function fetchShifts(periodStart: string, periodEnd: string): Promise<ShiftEntry[]> {
  const { data, error } = await db
    .from('shift_entries')
    .select('id, user_id, user_name, started_at, ended_at, meal_minutes, needs_review')
    .is('archived_at', null)
    .not('ended_at', 'is', null)
    .gte('started_at', new Date(`${periodStart}T00:00:00`).toISOString())
    .lt('started_at', new Date(`${periodEnd}T23:59:59`).toISOString());
  // Hourly pay can be used before the shift clock is set up: no table means no hours, not a failed run.
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, startedAt: r.started_at, endedAt: r.ended_at, mealMinutes: Number(r.meal_minutes) || 0, needsReview: !!r.needs_review }));
}

export async function fetchStaffStatements(): Promise<StaffStatement[]> {
  const { data, error } = await db.from('staff_pay_statements').select('*').is('archived_at', null).order('period_end', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ ...r, gross_pay: Number(r.gross_pay), non_taxable: Number(r.non_taxable), deductions: Number(r.deductions), tax_withholding: Number(r.tax_withholding) || 0, net_pay: Number(r.net_pay) }));
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
