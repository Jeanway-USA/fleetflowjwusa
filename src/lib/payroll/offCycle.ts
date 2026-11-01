import { supabase } from '@/integrations/supabase/client';
import { applyW2WithholdingToSettlements } from '@/lib/payroll/applySettlementWithholding';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import { loadStaffTaxContext, staffTaxesFor, staffYtd } from '@/lib/payroll/staffTax';
import { totalsOf, type PayRunItem } from '@/lib/payroll/payRun';
import type { Payee } from '@/lib/tax/records';

const db = supabase as any;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * An off-cycle run pays one person outside the regular payday: a bonus, back pay, a correction, a reimbursement. Federal
 * income tax comes out at the flat 22% supplemental rate, since the pay is not a regular paycheck. Everything else (Social
 * Security, Medicare, state programs) is worked out the usual way against the person's year so far.
 */

export type OffCycleKind = 'earning' | 'reimbursement' | 'deduction';

export interface OffCycleLine {
  kind: OffCycleKind;
  label: string;
  amount: number;
}

export const OFF_CYCLE_KIND_LABEL: Record<OffCycleKind, string> = {
  earning: 'Pay (taxable)',
  reimbursement: 'Reimbursement (not taxable)',
  deduction: 'Deduction',
};

export function summarizeOffCycle(lines: OffCycleLine[]) {
  const sum = (k: OffCycleKind) => round2(lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0));
  return { earnings: sum('earning'), reimbursements: sum('reimbursement'), deductions: sum('deduction') };
}

/** Returns what is wrong with an off-cycle payment, or null when it can be made. */
export function validateOffCycle(args: { payDate: string; reason: string; lines: OffCycleLine[] }): string | null {
  if (!args.payDate) return 'Choose the pay date.';
  if (!args.reason.trim()) return 'Say why this is being paid outside the regular run.';
  if (args.lines.length === 0) return 'Add at least one line.';
  for (const l of args.lines) {
    if (!l.label.trim()) return 'Every line needs a description.';
    if (!(l.amount > 0)) return `"${l.label}" needs an amount above zero. Deductions are entered as positive numbers.`;
  }
  const s = summarizeOffCycle(args.lines);
  if (s.earnings === 0 && s.reimbursements === 0) return 'There is nothing to pay: add pay or a reimbursement.';
  return null;
}

export async function createOffCycleRun(args: { orgId: string; userId: string | null; payDate: string; reason: string; payee: Payee; lines: OffCycleLine[] }): Promise<{ runId: string }> {
  const { orgId, userId, payDate, reason, payee, lines } = args;
  const problem = validateOffCycle({ payDate, reason, lines });
  if (problem) throw new Error(problem);
  if (payee.type === 'employee' && !payee.userId) throw new Error(`${payee.firstName} ${payee.lastName} has no sign-in account, so staff pay cannot be saved for them yet.`);

  const taxCtx = await loadStaffTaxContext(orgId);
  const { data: run, error: runError } = await db.from('pay_runs').insert({
    org_id: orgId, run_type: 'off_cycle', pay_date: payDate, driver_period_start: payDate, driver_period_end: payDate, staff_period_start: payDate, staff_period_end: payDate,
    status: 'draft', note: reason.trim(), created_by: userId,
  }).select('id').single();
  if (runError) throw new Error(runError.message);

  let archive: (() => Promise<void>) | null = null;
  try {
    const s = summarizeOffCycle(lines);
    const name = `${payee.firstName} ${payee.lastName}`.trim();
    let item: Omit<PayRunItem, 'id' | 'run_id'>;

    if (payee.type === 'driver') {
      const { data: settlement, error } = await db.from('driver_settlements').insert({
        org_id: orgId, driver_id: payee.id, period_start: payDate, period_end: payDate, payment_date: payDate, gross_pay: 0, reimbursements: 0, deductions: 0, status: 'draft',
        generated_by: userId, generated_at: new Date().toISOString(), notes: `Off-cycle: ${reason.trim()}`,
      }).select('*').single();
      if (error) throw new Error(error.message);
      archive = async () => { await db.rpc('archive_record', { _table: 'driver_settlements', _id: settlement.id }); };
      const { error: itemsError } = await db.from('driver_settlement_items').insert(lines.map((l) => ({
        org_id: orgId, settlement_id: settlement.id, item_type: l.kind === 'earning' ? 'load_pay' : l.kind, description: l.label.trim(), amount: l.amount, is_escrow: false,
      })));
      if (itemsError) throw new Error(itemsError.message);
      const recalc = await db.rpc('recalc_settlement_totals', { _settlement_id: settlement.id });
      if (recalc.error) throw new Error(recalc.error.message);
      await applyW2WithholdingToSettlements([recalc.data], {
        orgId, config: defaultTaxYearConfig(Number(payDate.slice(0, 4))), statesByCode: taxCtx.statesByCode, payFrequency: taxCtx.payFrequency, defaultTaxState: taxCtx.defaultTaxState, supplemental: true,
      });
      const { data: fresh } = await db.from('driver_settlements').select('gross_pay, reimbursements, deductions, tax_withholding, net_pay').eq('id', settlement.id).single();
      item = { source: 'settlement', source_id: settlement.id, payee_key: payee.key, payee_name: name, gross: Number(fresh.gross_pay) || 0, non_taxable: Number(fresh.reimbursements) || 0, taxes: Number(fresh.tax_withholding) || 0, deductions: Number(fresh.deductions) || 0, net: Number(fresh.net_pay) || 0, warnings: [] };
    } else {
      const year = Number(payDate.slice(0, 4));
      const ytd = await staffYtd(orgId, payee.userId as string, year, payDate);
      const taxes = staffTaxesFor({ payee, taxableGross: s.earnings, nonTaxable: s.reimbursements, deductions: s.deductions, config: defaultTaxYearConfig(year), ctx: taxCtx, ytd, supplemental: true });
      const payLines = lines.map((l, i) => ({ componentId: 'off-cycle', componentType: 'custom', label: l.label.trim(), method: 'extra', amount: l.amount, isDeduction: l.kind === 'deduction', isTaxable: l.kind === 'earning', detail: `Off-cycle: ${reason.trim()}`, sortOrder: i }));
      const { data: st, error } = await db.from('staff_pay_statements').insert({
        org_id: orgId, user_id: payee.userId, package_name: `Off-cycle: ${reason.trim()}`, period_start: payDate, period_end: payDate, gross_pay: s.earnings, non_taxable: s.reimbursements, deductions: s.deductions,
        tax_withholding: taxes.taxWithholding, tax_calculation: taxes.calculation, net_pay: taxes.netPay, lines: payLines, created_by: userId, note: reason.trim(),
      }).select('id').single();
      if (error) throw new Error(error.message);
      archive = async () => { await db.rpc('set_staff_pay_statement_status', { _id: st.id, _action: 'archive' }); };
      item = { source: 'staff_statement', source_id: st.id, payee_key: `staff:${payee.userId}`, payee_name: name, gross: s.earnings, non_taxable: s.reimbursements, taxes: taxes.taxWithholding, deductions: s.deductions, net: taxes.netPay, warnings: taxes.warnings };
    }

    const { error: itemError } = await db.from('pay_run_items').insert({ ...item, run_id: run.id, org_id: orgId });
    if (itemError) throw new Error(itemError.message);
    const { error: totalsError } = await db.from('pay_runs').update({ totals: { ...totalsOf([item as PayRunItem]), skipped: [] } }).eq('id', run.id);
    if (totalsError) throw new Error(totalsError.message);
  } catch (failure) {
    if (archive) await archive().catch(() => undefined);
    await db.from('pay_runs').update({ status: 'void', voided_at: new Date().toISOString(), void_reason: `Could not be built: ${(failure as Error).message}` }).eq('id', run.id);
    throw failure;
  }
  return { runId: run.id as string };
}
