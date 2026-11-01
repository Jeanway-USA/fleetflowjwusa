import { supabase } from '@/integrations/supabase/client';
import { buildAchFile, achProblems, type AchCompany, type AchEntry, type AchFile } from '@/lib/payroll/ach';
import type { PayRun, PayRunItem } from '@/lib/payroll/payRun';

const db = supabase as any;

/**
 * Paying people once a run is approved: who gets a direct deposit, who gets a check, and whether each payment was sent.
 * A payment is only ever recorded for an approved run, and nothing is deleted: a payment that goes wrong is marked
 * returned or void and a new one is made.
 */

export type PayMethod = 'direct_deposit' | 'check' | 'manual';
export type PaymentStatus = 'pending' | 'sent' | 'returned' | 'void';

export interface Payment {
  id: string;
  run_id: string;
  item_id: string;
  payee_key: string;
  payee_name: string;
  method: PayMethod;
  amount: number;
  status: PaymentStatus;
  account_last4: string | null;
  check_number: number | null;
  batch_ref: string | null;
  sent_at: string | null;
  note: string | null;
}

export interface BankStatus { item_id: string; bank_name: string | null; account_type: string | null; account_last4: string | null }

export const METHOD_LABEL: Record<PayMethod, string> = { direct_deposit: 'Direct deposit', check: 'Check', manual: 'Paid another way' };
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { pending: 'Not sent', sent: 'Sent', returned: 'Returned', void: 'Void' };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const toCents = (n: number) => Math.round(round2(n) * 100);

export interface PaymentSettings extends AchCompany { nextCheckNumber: number }

export async function loadPaymentSettings(orgId: string): Promise<PaymentSettings> {
  const { data } = await db.from('payroll_settings').select('ach_company_name, ach_company_id, ach_bank_name, ach_bank_routing, ach_next_check_number').eq('org_id', orgId).maybeSingle();
  return {
    name: data?.ach_company_name ?? '',
    companyId: data?.ach_company_id ?? '',
    bankName: data?.ach_bank_name ?? '',
    bankRouting: data?.ach_bank_routing ?? '',
    nextCheckNumber: Number(data?.ach_next_check_number) || 1001,
  };
}

export async function savePaymentSettings(orgId: string, s: PaymentSettings): Promise<void> {
  const row = {
    ach_company_name: s.name.trim() || null,
    ach_company_id: s.companyId.trim() || null,
    ach_bank_name: s.bankName.trim() || null,
    ach_bank_routing: s.bankRouting.trim() || null,
    ach_next_check_number: Math.max(1, Math.round(s.nextCheckNumber) || 1001),
  };
  const { data: existing } = await db.from('payroll_settings').select('org_id').eq('org_id', orgId).maybeSingle();
  const { error } = existing ? await db.from('payroll_settings').update(row).eq('org_id', orgId) : await db.from('payroll_settings').insert({ org_id: orgId, ...row });
  if (error) throw new Error(error.message);
}

export async function fetchPayments(runId: string): Promise<Payment[]> {
  const { data, error } = await db.from('pay_run_payments').select('*').eq('run_id', runId).order('payee_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Last 4 digits and bank name for each person in a run, without the account numbers themselves. */
export async function fetchBankStatus(runId: string): Promise<Map<string, BankStatus>> {
  const { data, error } = await db.rpc('get_run_bank_status', { _run_id: runId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as BankStatus[]).map((r) => [r.item_id, r]));
}

/** Pure: how each person in an approved run should be paid. Direct deposit when bank details are on file, a check otherwise. */
export function planPayments(items: PayRunItem[], bank: Map<string, BankStatus>): Array<{ item: PayRunItem; method: PayMethod; amount: number; last4: string | null }> {
  return items.map((item) => {
    const amount = round2(item.net);
    const b = bank.get(item.id);
    const method: PayMethod = amount <= 0 ? 'manual' : b?.account_last4 ? 'direct_deposit' : 'check';
    return { item, method, amount, last4: method === 'direct_deposit' ? b?.account_last4 ?? null : null };
  });
}

/** Records a payment for everyone in the run who does not have one yet. Safe to run again. */
export async function createPayments(run: PayRun, items: PayRunItem[], userId: string | null, orgId: string): Promise<number> {
  if (run.status !== 'approved' && run.status !== 'paid') throw new Error('Approve the pay run before setting up payments.');
  const existing = await fetchPayments(run.id);
  const have = new Set(existing.map((p) => p.item_id));
  const bank = await fetchBankStatus(run.id);
  const rows = planPayments(items.filter((i) => !have.has(i.id)), bank).map((p) => ({
    org_id: orgId, run_id: run.id, item_id: p.item.id, payee_key: p.item.payee_key, payee_name: p.item.payee_name,
    method: p.method, amount: p.amount, account_last4: p.last4, status: p.method === 'manual' ? 'sent' : 'pending', created_by: userId,
    note: p.method === 'manual' ? 'Nothing to pay this period.' : null,
  }));
  if (rows.length === 0) return 0;
  const { error } = await db.from('pay_run_payments').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Change how one person is paid (for example a deposit that bounced becomes a check). Only while it has not been sent. */
export async function changeMethod(payment: Payment, method: PayMethod, last4: string | null): Promise<void> {
  if (payment.status === 'sent') throw new Error('This payment was already sent. Mark it returned first if it came back.');
  const { error } = await db.from('pay_run_payments').update({ method, account_last4: method === 'direct_deposit' ? last4 : null, status: 'pending', check_number: method === 'check' ? payment.check_number : null }).eq('id', payment.id);
  if (error) throw new Error(error.message);
}

export interface BuiltDeposit { file: AchFile; included: Payment[]; problems: string[] }

/**
 * Builds the direct deposit file for the payments not yet sent. The bank details are read through the locked-down function
 * (owner and payroll only, logged), used to build the file in this browser, and never saved anywhere.
 */
export async function buildRunDeposit(run: PayRun, company: AchCompany, payments: Payment[], effectiveDate: string, fileIdModifier = 'A'): Promise<BuiltDeposit> {
  const todo = payments.filter((p) => p.method === 'direct_deposit' && p.status === 'pending' && p.amount > 0);
  const { data, error } = await db.rpc('get_run_bank_details', { _run_id: run.id });
  if (error) throw new Error(error.message);
  const byItem = new Map<string, { routing_number: string; account_number: string; account_type: string }>(((data ?? []) as any[]).map((r) => [r.item_id, r]));
  const entries: AchEntry[] = [];
  const problems: string[] = [];
  const included: Payment[] = [];
  todo.forEach((p, i) => {
    const b = byItem.get(p.item_id);
    if (!b?.routing_number || !b?.account_number) { problems.push(`${p.payee_name}: no bank details on file. Change them to a check, or add their bank details first.`); return; }
    entries.push({ name: p.payee_name, routing: b.routing_number, account: b.account_number, accountType: b.account_type === 'savings' ? 'savings' : 'checking', amountCents: toCents(p.amount), idNumber: `${p.payee_key.startsWith('driver') ? 'DRV' : 'STF'}${String(i + 1).padStart(4, '0')}` });
    included.push(p);
  });
  const now = new Date();
  problems.push(...achProblems(company, entries, effectiveDate, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`));
  if (problems.length > 0) return { file: { text: '', entryCount: 0, totalCents: 0, lineCount: 0 }, included: [], problems };
  return { file: buildAchFile({ company, entries, effectiveDate, fileIdModifier }), included, problems: [] };
}

export async function markSent(paymentIds: string[], userId: string | null, batchRef: string | null): Promise<void> {
  if (paymentIds.length === 0) return;
  const { error } = await db.from('pay_run_payments').update({ status: 'sent', sent_at: new Date().toISOString(), sent_by: userId, batch_ref: batchRef }).in('id', paymentIds);
  if (error) throw new Error(error.message);
}

export async function markReturned(paymentId: string, note: string): Promise<void> {
  if (!note.trim()) throw new Error('Say why it came back.');
  const { error } = await db.from('pay_run_payments').update({ status: 'returned', note: note.trim() }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

/** Gives each check payment a number, in order, and moves the next-number counter on. Already-numbered checks keep theirs. */
export async function assignCheckNumbers(orgId: string, payments: Payment[]): Promise<Payment[]> {
  const settings = await loadPaymentSettings(orgId);
  let next = settings.nextCheckNumber;
  const out: Payment[] = [];
  for (const p of payments) {
    if (p.check_number != null) { out.push(p); continue; }
    const { error } = await db.from('pay_run_payments').update({ check_number: next }).eq('id', p.id);
    if (error) throw new Error(error.message);
    out.push({ ...p, check_number: next });
    next += 1;
  }
  if (next !== settings.nextCheckNumber) await savePaymentSettings(orgId, { ...settings, nextCheckNumber: next });
  return out;
}

/** One row per payment for a spreadsheet, so a bank that takes payments typed in has everything to copy from. */
export function paymentListRows(payments: Payment[]): Array<Array<string | number>> {
  return payments.map((p) => [p.payee_name, METHOD_LABEL[p.method], p.account_last4 ? `ending ${p.account_last4}` : '', p.check_number ?? '', p.amount, PAYMENT_STATUS_LABEL[p.status]]);
}
