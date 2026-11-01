import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { generateDriverPay } from '@/lib/payroll/generateDriverPay';
import { loadStaffTaxContext } from '@/lib/payroll/staffTax';
import { loadPackageContext } from '@/lib/pay-packages/generate';
import { generateStaffStatements, setStatementStatus, staffOnPackages } from '@/lib/pay-packages/staff';
import { settlementWeek } from '@/lib/settlement-week';

const db = supabase as any;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * A pay run is one payday for everyone: drivers (paid for their Landstar week, Thursday to Wednesday) and staff (paid for
 * a Monday to Sunday week). It groups their draft pay so it is checked, approved and paid together, and then it is locked.
 * The pay itself still lives on the settlement or statement; the run keeps what was approved so it can be compared later.
 */

export type RunStatus = 'draft' | 'approved' | 'paid' | 'void';

export interface PayRun {
  id: string;
  run_type: 'regular' | 'off_cycle';
  pay_date: string;
  driver_period_start: string | null;
  driver_period_end: string | null;
  staff_period_start: string | null;
  staff_period_end: string | null;
  status: RunStatus;
  note: string | null;
  totals: RunTotals & { skipped?: Array<{ name: string; reason: string }> };
  approved_at: string | null;
  paid_at: string | null;
  void_reason: string | null;
  created_at: string;
  created_by?: string | null;
  approved_by?: string | null;
  paid_by?: string | null;
  voided_by?: string | null;
  voided_at?: string | null;
}

export interface PayRunItem {
  id: string;
  run_id: string;
  source: 'settlement' | 'staff_statement';
  source_id: string;
  payee_key: string;
  payee_name: string;
  gross: number;
  non_taxable: number;
  taxes: number;
  deductions: number;
  net: number;
  warnings: string[];
}

export interface RunTotals {
  people: number;
  gross: number;
  nonTaxable: number;
  taxes: number;
  deductions: number;
  net: number;
}

export interface ReviewIssue {
  level: 'block' | 'warn';
  who: string;
  message: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------------------------

export interface RunPeriods {
  driver: { start: string; end: string };
  staff: { start: string; end: string };
}

/** The last driver week (Thursday to Wednesday) and the last staff week (Monday to Sunday) that finished before payday. */
export function suggestedPeriods(payDate: Date): RunPeriods {
  const driverWeek = settlementWeek(payDate, -1);
  // Last Sunday strictly before payday.
  let sunday = subDays(payDate, 1);
  while (sunday.getDay() !== 0) sunday = subDays(sunday, 1);
  return {
    driver: { start: iso(driverWeek.start), end: iso(driverWeek.end) },
    staff: { start: iso(subDays(sunday, 6)), end: iso(sunday) },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Review: totals and the things to check before approving
// ---------------------------------------------------------------------------------------------------------------

export function totalsOf(items: Array<Pick<PayRunItem, 'payee_key' | 'gross' | 'non_taxable' | 'taxes' | 'deductions' | 'net'>>): RunTotals {
  return {
    people: new Set(items.map((i) => i.payee_key)).size,
    gross: round2(items.reduce((s, i) => s + i.gross, 0)),
    nonTaxable: round2(items.reduce((s, i) => s + i.non_taxable, 0)),
    taxes: round2(items.reduce((s, i) => s + i.taxes, 0)),
    deductions: round2(items.reduce((s, i) => s + i.deductions, 0)),
    net: round2(items.reduce((s, i) => s + i.net, 0)),
  };
}

/**
 * What stops a run from being approved (block) and what to look at first (warn). A person's net pay is gross plus
 * reimbursements, less deductions and taxes: if the saved net does not add up, the run is not trusted.
 */
export function reviewItems(items: PayRunItem[]): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const seen = new Map<string, number>();
  for (const i of items) {
    seen.set(i.payee_key, (seen.get(i.payee_key) ?? 0) + 1);
    const expectedNet = round2(i.gross + i.non_taxable - i.deductions - i.taxes);
    if (i.net < 0) out.push({ level: 'block', who: i.payee_name, message: `Net pay is negative (${i.net.toFixed(2)}). Deductions and taxes are more than the pay. Fix the deductions before paying.` });
    if (Math.abs(expectedNet - i.net) >= 0.02) out.push({ level: 'block', who: i.payee_name, message: `The saved net pay (${i.net.toFixed(2)}) does not equal pay plus reimbursements less deductions and taxes (${expectedNet.toFixed(2)}). Generate this person's pay again.` });
    if (i.gross === 0 && i.non_taxable === 0) out.push({ level: 'warn', who: i.payee_name, message: 'Nothing was earned in this period.' });
    for (const w of i.warnings) out.push({ level: 'warn', who: i.payee_name, message: w });
  }
  for (const [key, n] of seen) {
    if (n > 1) out.push({ level: 'block', who: items.find((i) => i.payee_key === key)!.payee_name, message: `Appears ${n} times in this run. A person is paid once per run. Archive the extra.` });
  }
  return out;
}

export const canApprove = (issues: ReviewIssue[]) => !issues.some((i) => i.level === 'block');

// ---------------------------------------------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------------------------------------------

export async function fetchRuns(): Promise<PayRun[]> {
  const { data, error } = await db.from('pay_runs').select('*').order('pay_date', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as PayRun[];
}

export async function fetchRunItems(runId: string): Promise<PayRunItem[]> {
  const { data, error } = await db.from('pay_run_items').select('*').eq('run_id', runId).order('payee_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ ...r, gross: Number(r.gross), non_taxable: Number(r.non_taxable), taxes: Number(r.taxes), deductions: Number(r.deductions), net: Number(r.net), warnings: Array.isArray(r.warnings) ? r.warnings : [] }));
}

export interface CreateRunArgs {
  orgId: string;
  userId: string | null;
  payDate: string;
  periods: RunPeriods;
  note?: string;
}

/**
 * Starts a draft run: makes (or refreshes) each person's draft pay for the periods, then groups them. Nothing is paid.
 * People who cannot be paid yet (no pay package, a clock entry to review, an approved settlement already) are listed as
 * skipped so nobody is silently left out.
 */
export async function createPayRun(args: CreateRunArgs): Promise<{ runId: string }> {
  const { orgId, userId, payDate, periods } = args;
  if (periods.driver.start > periods.driver.end || periods.staff.start > periods.staff.end) throw new Error('A pay period starts after it ends.');

  const { data: existing } = await db.from('pay_runs').select('id, status').eq('org_id', orgId).eq('pay_date', payDate).eq('run_type', 'regular').neq('status', 'void');
  if ((existing ?? []).length > 0) throw new Error(`There is already a pay run for ${payDate}. Open it, or void it first if it was a mistake.`);

  const taxCtx = await loadStaffTaxContext(orgId);
  const nameOf = new Map(taxCtx.payees.map((p) => [p.key, `${p.firstName} ${p.lastName}`.trim() || 'Unnamed']));
  const skipped: Array<{ name: string; reason: string }> = [];

  const { data: run, error: runError } = await db.from('pay_runs').insert({
    org_id: orgId, run_type: 'regular', pay_date: payDate,
    driver_period_start: periods.driver.start, driver_period_end: periods.driver.end,
    staff_period_start: periods.staff.start, staff_period_end: periods.staff.end,
    status: 'draft', note: args.note ?? null, created_by: userId,
  }).select('id').single();
  if (runError) throw new Error(runError.message);

  try {
    const items: Array<Omit<PayRunItem, 'id' | 'run_id'>> = [];

    // Drivers: everyone active on the roster. Contractors are included; only W-2 drivers have tax withheld.
    const driverIds = taxCtx.payees.filter((p) => p.type === 'driver' && p.active).map((p) => p.id);
    if (driverIds.length > 0) {
      const made = await generateDriverPay({
        orgId, userId, driverIds, periodStart: periods.driver.start, periodEnd: periods.driver.end, paymentDate: payDate,
        taxContext: { statesByCode: taxCtx.statesByCode, payFrequency: taxCtx.payFrequency, defaultTaxState: taxCtx.defaultTaxState },
        allSelected: false,
      });
      for (const s of made.packageSkipped) skipped.push({ name: nameOf.get(`driver:${s.driverId}`) ?? 'A driver', reason: s.reason });
      const { data: settlements } = await db.from('driver_settlements')
        .select('id, driver_id, gross_pay, reimbursements, deductions, tax_withholding, net_pay, status')
        .eq('org_id', orgId).in('driver_id', driverIds).eq('period_end', periods.driver.end).is('deleted_at', null);
      const have = new Set<string>();
      for (const s of (settlements ?? []) as any[]) {
        const payee = taxCtx.payees.find((p) => p.key === `driver:${s.driver_id}`);
        have.add(s.driver_id);
        const warnings: string[] = [];
        if (s.status !== 'draft') warnings.push(`Already ${s.status} before this run. It is included as it stands.`);
        if (payee?.employmentClass === 'w2' && !payee.hasW4) warnings.push('No Form W-4 on file: federal tax is withheld as single with no adjustments.');
        if (payee && payee.profile.sitState) {
          const code = payee.profile.sitState.toUpperCase();
          if (code && !['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'].includes(code) && payee.employmentClass === 'w2') warnings.push(`${code} income tax is not calculated automatically. Check what the state requires.`);
        }
        items.push({ source: 'settlement', source_id: s.id, payee_key: `driver:${s.driver_id}`, payee_name: nameOf.get(`driver:${s.driver_id}`) ?? 'Driver', gross: Number(s.gross_pay) || 0, non_taxable: Number(s.reimbursements) || 0, taxes: Number(s.tax_withholding) || 0, deductions: Number(s.deductions) || 0, net: Number(s.net_pay) || 0, warnings });
      }
      for (const id of driverIds) {
        if (!have.has(id) && !skipped.some((k) => k.name === nameOf.get(`driver:${id}`))) skipped.push({ name: nameOf.get(`driver:${id}`) ?? 'A driver', reason: 'Nothing to pay: no loads or pay in the period.' });
      }
    }

    // Staff: people with a pay package and no driver record (drivers are paid through settlements).
    const pkgContext = await loadPackageContext();
    const { data: driverUsers } = await db.from('drivers').select('user_id').not('user_id', 'is', null);
    const driverUserIds = new Set(((driverUsers ?? []) as any[]).map((d) => d.user_id as string));
    const staffIds = staffOnPackages(pkgContext, periods.staff.end).filter((id) => !driverUserIds.has(id));
    if (staffIds.length > 0) {
      const made = await generateStaffStatements({ orgId, userId, staffIds, periodStart: periods.staff.start, periodEnd: periods.staff.end, context: pkgContext, payDate });
      const staffName = new Map(taxCtx.payees.filter((p) => p.type === 'employee' && p.userId).map((p) => [p.userId as string, `${p.firstName} ${p.lastName}`.trim()]));
      for (const s of made.skipped) skipped.push({ name: staffName.get(s.userId) ?? 'A staff member', reason: s.reason });
      const { data: statements } = await db.from('staff_pay_statements')
        .select('id, user_id, gross_pay, non_taxable, deductions, tax_withholding, net_pay, status')
        .eq('org_id', orgId).in('user_id', staffIds).eq('period_end', periods.staff.end).is('archived_at', null);
      for (const s of (statements ?? []) as any[]) {
        const warnings = made.warnings.filter((w) => w.userId === s.user_id).map((w) => w.message);
        if (s.status !== 'draft') warnings.push(`Already ${s.status} before this run. It is included as it stands.`);
        items.push({ source: 'staff_statement', source_id: s.id, payee_key: `staff:${s.user_id}`, payee_name: staffName.get(s.user_id) ?? 'Staff', gross: Number(s.gross_pay) || 0, non_taxable: Number(s.non_taxable) || 0, taxes: Number(s.tax_withholding) || 0, deductions: Number(s.deductions) || 0, net: Number(s.net_pay) || 0, warnings });
      }
    }

    if (items.length > 0) {
      const { error } = await db.from('pay_run_items').insert(items.map((i) => ({ ...i, run_id: run.id, org_id: orgId })));
      if (error) throw new Error(error.message);
    }
    const totals = { ...totalsOf(items), skipped };
    const { error: totalsError } = await db.from('pay_runs').update({ totals }).eq('id', run.id);
    if (totalsError) throw new Error(totalsError.message);
  } catch (failure) {
    // A run that could not be built is voided (kept for the record), never left half-made.
    await db.from('pay_runs').update({ status: 'void', voided_at: new Date().toISOString(), void_reason: `Could not be built: ${(failure as Error).message}` }).eq('id', run.id);
    throw failure;
  }
  return { runId: run.id as string };
}

/** Reads each person's pay again and checks it still matches what the run recorded. Anything edited since is caught here. */
async function driftOf(items: PayRunItem[]): Promise<string[]> {
  const problems: string[] = [];
  const settlementIds = items.filter((i) => i.source === 'settlement').map((i) => i.source_id);
  const staffIds = items.filter((i) => i.source === 'staff_statement').map((i) => i.source_id);
  const [{ data: s }, { data: t }] = await Promise.all([
    settlementIds.length ? db.from('driver_settlements').select('id, net_pay, status, deleted_at').in('id', settlementIds) : { data: [] },
    staffIds.length ? db.from('staff_pay_statements').select('id, net_pay, status, archived_at').in('id', staffIds) : { data: [] },
  ]);
  const live = new Map<string, any>();
  for (const r of (s ?? []) as any[]) live.set(r.id, { net: Number(r.net_pay), gone: !!r.deleted_at });
  for (const r of (t ?? []) as any[]) live.set(r.id, { net: Number(r.net_pay), gone: !!r.archived_at });
  for (const i of items) {
    const now = live.get(i.source_id);
    if (!now || now.gone) problems.push(`${i.payee_name}'s pay was archived or removed after the run was made.`);
    else if (Math.abs(now.net - i.net) >= 0.01) problems.push(`${i.payee_name}'s net pay changed from ${i.net.toFixed(2)} to ${now.net.toFixed(2)} after the run was made.`);
  }
  return problems;
}

export async function approveRun(run: PayRun, userId: string | null): Promise<void> {
  if (run.status !== 'draft') throw new Error('Only a draft run can be approved.');
  const items = await fetchRunItems(run.id);
  if (items.length === 0) throw new Error('This run has no one in it.');
  const issues = reviewItems(items).filter((i) => i.level === 'block');
  if (issues.length > 0) throw new Error(`${issues[0].who}: ${issues[0].message}`);
  const drift = await driftOf(items);
  if (drift.length > 0) throw new Error(`${drift[0]} Start a new run, or void this one.`);

  const now = new Date().toISOString();
  for (const i of items) {
    if (i.source === 'settlement') {
      const { error } = await db.from('driver_settlements').update({ status: 'approved', approved_at: now, approved_by: userId }).eq('id', i.source_id).eq('status', 'draft');
      if (error) throw new Error(error.message);
    } else {
      const { data } = await db.from('staff_pay_statements').select('status').eq('id', i.source_id).maybeSingle();
      if (data?.status === 'draft') await setStatementStatus(i.source_id, 'approve');
    }
  }
  const { error } = await db.from('pay_runs').update({ status: 'approved', approved_by: userId, approved_at: now, totals: { ...run.totals, ...totalsOf(items) } }).eq('id', run.id);
  if (error) throw new Error(error.message);
}

export async function markRunPaid(run: PayRun, userId: string | null): Promise<void> {
  if (run.status !== 'approved') throw new Error('Only an approved run can be marked paid.');
  const items = await fetchRunItems(run.id);
  const now = new Date().toISOString();
  for (const i of items) {
    if (i.source === 'settlement') {
      const { error } = await db.from('driver_settlements').update({ status: 'paid', paid_at: now }).eq('id', i.source_id).eq('status', 'approved');
      if (error) throw new Error(error.message);
    } else {
      const { data } = await db.from('staff_pay_statements').select('status').eq('id', i.source_id).maybeSingle();
      if (data?.status === 'approved') await setStatementStatus(i.source_id, 'pay');
    }
  }
  const { error } = await db.from('pay_runs').update({ status: 'paid', paid_by: userId, paid_at: now }).eq('id', run.id);
  if (error) throw new Error(error.message);
}

/** A draft run is voided and its draft pay archived (kept, restorable). An approved or paid run is never voided here. */
export async function voidDraftRun(run: PayRun, userId: string | null, reason: string): Promise<void> {
  if (run.status !== 'draft') throw new Error('Only a draft run can be voided. An approved run must be corrected with an off-cycle adjustment.');
  if (!reason.trim()) throw new Error('Say why the run is being voided.');
  const items = await fetchRunItems(run.id);
  for (const i of items) {
    if (i.source === 'settlement') await db.rpc('archive_record', { _table: 'driver_settlements', _id: i.source_id });
    else await setStatementStatus(i.source_id, 'archive');
  }
  const { error } = await db.from('pay_runs').update({ status: 'void', voided_by: userId, voided_at: new Date().toISOString(), void_reason: reason.trim() }).eq('id', run.id);
  if (error) throw new Error(error.message);
}


/**
 * Corrects an approved run that has not been paid out. Its pay is archived (kept, restorable), its unsent payments are
 * marked void, and the run is voided so a new run can be made for the same payday. If money has already been sent to anyone
 * it is refused: that has to be fixed with an off-cycle correction, because the money cannot be pulled back from here.
 * A paid run is never voided.
 */
export async function voidApprovedRun(run: PayRun, userId: string | null, reason: string): Promise<void> {
  if (run.status === 'paid') throw new Error('A paid run cannot be voided. Correct it with an off-cycle adjustment.');
  if (run.status !== 'approved') throw new Error('Only an approved run can be voided here.');
  if (!reason.trim()) throw new Error('Say why the run is being voided.');

  // Money already sent cannot be taken back from here.
  const { data: payments, error: paymentsError } = await db.from('pay_run_payments').select('id, method, status, payee_name').eq('run_id', run.id);
  const live = paymentsError ? [] : ((payments ?? []) as Array<{ id: string; method: string; status: string; payee_name: string }>);
  const sent = live.filter((p) => p.status === 'sent' && p.method !== 'manual');
  if (sent.length > 0) throw new Error(`Money was already sent to ${sent.length} ${sent.length === 1 ? 'person' : 'people'} (${sent.slice(0, 3).map((p) => p.payee_name).join(', ')}${sent.length > 3 ? ', and more' : ''}). Cancel the payments at your bank first, then correct this with an off-cycle adjustment.`);

  const items = await fetchRunItems(run.id);
  for (const i of items) {
    if (i.source === 'settlement') {
      const { error } = await db.rpc('archive_record', { _table: 'driver_settlements', _id: i.source_id });
      if (error) throw new Error(error.message);
    } else {
      await setStatementStatus(i.source_id, 'archive');
    }
  }
  if (live.length > 0) {
    const { error } = await db.from('pay_run_payments').update({ status: 'void', note: `Run voided: ${reason.trim()}` }).eq('run_id', run.id).neq('status', 'sent');
    if (error) throw new Error(error.message);
  }
  const { error } = await db.from('pay_runs').update({ status: 'void', voided_by: userId, voided_at: new Date().toISOString(), void_reason: reason.trim() }).eq('id', run.id);
  if (error) throw new Error(error.message);
}
