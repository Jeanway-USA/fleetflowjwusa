import { supabase } from '@/integrations/supabase/client';
import type { PayRun, PayRunItem } from '@/lib/payroll/payRun';

const db = supabase as any;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Everything printed on one pay stub, worked out from what the run saved. Pay stubs and the payroll register come from the
 * same data, so a stub can never show a different number than the register.
 */
export interface StubLine {
  label: string;
  detail?: string;
  amount: number;
  /** For a tax line, which tax it is (federal_income_tax, social_security, and so on). */
  key?: string;
}

export interface StubData {
  itemId: string;
  name: string;
  payeeKind: 'Driver' | 'Staff';
  payDate: string;
  periodStart: string;
  periodEnd: string;
  runStatus: PayRun['status'];
  earnings: StubLine[];
  reimbursements: StubLine[];
  deductions: StubLine[];
  /** Taxes taken from the person's pay. */
  taxes: StubLine[];
  /** Taxes the company pays on top. Shown on the register, not on the stub. */
  employerTaxes: StubLine[];
  /** What the company adds on top for benefits and the 401(k) match. Not on the stub; on the register and the journal. */
  employerBenefits: StubLine[];
  gross: number;
  nonTaxable: number;
  taxTotal: number;
  deductionTotal: number;
  net: number;
  ytd: { gross: number; taxes: number; net: number };
  /** Short lines printed under the totals, such as the paid sick leave balance. */
  notes: string[];
}

interface TaxLineLike {
  key: string;
  label: string;
  amount: number;
  side: 'employee' | 'employer';
  note?: string;
  rate?: number;
  taxableWages?: number;
}

/** Splits a saved tax calculation into what the person pays and what the company pays. */
export function taxLinesOf(calc: { lines?: TaxLineLike[] } | null | undefined): { employee: StubLine[]; employer: StubLine[] } {
  const lines = Array.isArray(calc?.lines) ? (calc!.lines as TaxLineLike[]) : [];
  const map = (side: 'employee' | 'employer') => lines.filter((l) => l.side === side && l.amount !== 0).map((l) => ({ key: l.key, label: l.label, detail: l.rate ? `${(l.rate * 100).toFixed(2)}% of ${round2(l.taxableWages ?? 0).toFixed(2)}` : l.note, amount: round2(l.amount) }));
  return { employee: map('employee'), employer: map('employer') };
}

/** The company's share of benefits and 401(k) match, from the deductions saved with a pay calculation. */
export function employerBenefitLines(calc: { payrollDeductions?: Array<{ label: string; employerAmount?: number }> } | null | undefined): StubLine[] {
  const list = Array.isArray(calc?.payrollDeductions) ? calc!.payrollDeductions! : [];
  return list.filter((d) => (Number(d.employerAmount) || 0) > 0).map((d) => ({ label: d.label, amount: round2(Number(d.employerAmount)) }));
}

/** Leave balances saved with a staff statement, as lines for the stub. */
export function timeOffNotes(calc: { timeOff?: { sick?: { available: number; earned: number; used: number } } } | null | undefined): string[] {
  const sick = calc?.timeOff?.sick;
  if (!sick) return [];
  const h = (n: number) => `${round2(n)} ${round2(n) === 1 ? 'hour' : 'hours'}`;
  return [`Paid sick leave: ${h(sick.available)} available (${h(sick.earned)} earned and ${h(sick.used)} used this pay period)`];
}

const EARNING_TYPES = new Set(['load_pay', 'accessorial']);

/** Pure: a stub from a settlement and its items. */
export function stubFromSettlement(args: {
  item: PayRunItem;
  run: Pick<PayRun, 'pay_date' | 'status'>;
  period: { start: string; end: string };
  items: Array<{ item_type: string; description: string | null; amount: number }>;
  taxCalculation: { lines?: TaxLineLike[] } | null;
  ytd: StubData['ytd'];
  gross: number;
  nonTaxable: number;
  deductions: number;
  net: number;
}): StubData {
  const { item, run, items, taxCalculation } = args;
  const line = (i: { description: string | null; amount: number }): StubLine => ({ label: i.description || 'Pay', amount: round2(Math.abs(Number(i.amount) || 0)) });
  const tax = taxLinesOf(taxCalculation);
  return {
    itemId: item.id, name: item.payee_name, payeeKind: 'Driver', payDate: run.pay_date, periodStart: args.period.start, periodEnd: args.period.end, runStatus: run.status,
    earnings: items.filter((i) => EARNING_TYPES.has(i.item_type)).map(line),
    reimbursements: items.filter((i) => i.item_type === 'reimbursement').map(line),
    deductions: items.filter((i) => i.item_type === 'deduction').map(line),
    taxes: tax.employee, employerTaxes: tax.employer, employerBenefits: employerBenefitLines(taxCalculation as never),
    gross: args.gross, nonTaxable: args.nonTaxable, taxTotal: item.taxes, deductionTotal: args.deductions, net: args.net, ytd: args.ytd, notes: [],
  };
}

/** Pure: a stub from a staff statement. */
export function stubFromStatement(args: {
  item: PayRunItem;
  run: Pick<PayRun, 'pay_date' | 'status'>;
  period: { start: string; end: string };
  lines: Array<{ label: string; detail?: string; amount: number; isDeduction: boolean; isTaxable: boolean }>;
  taxCalculation: { lines?: TaxLineLike[] } | null;
  ytd: StubData['ytd'];
}): StubData {
  const { item, run, lines, taxCalculation } = args;
  const line = (l: { label: string; detail?: string; amount: number }): StubLine => ({ label: l.label, detail: l.detail, amount: round2(l.amount) });
  const tax = taxLinesOf(taxCalculation);
  return {
    itemId: item.id, name: item.payee_name, payeeKind: 'Staff', payDate: run.pay_date, periodStart: args.period.start, periodEnd: args.period.end, runStatus: run.status,
    earnings: lines.filter((l) => !l.isDeduction && l.isTaxable).map(line),
    reimbursements: lines.filter((l) => !l.isDeduction && !l.isTaxable).map(line),
    deductions: lines.filter((l) => l.isDeduction).map(line),
    taxes: tax.employee, employerTaxes: tax.employer, employerBenefits: employerBenefitLines(taxCalculation as never),
    gross: item.gross, nonTaxable: item.non_taxable, taxTotal: item.taxes, deductionTotal: item.deductions, net: item.net, ytd: args.ytd, notes: timeOffNotes(taxCalculation as never),
  };
}

/** Year-to-date through a pay period: approved and paid pay in the same year, plus this period's pay if it is still a draft. */
async function ytdFor(table: 'driver_settlements' | 'staff_pay_statements', key: 'driver_id' | 'user_id', id: string, orgId: string, periodEnd: string, current: { id: string; gross: number; taxes: number; net: number }): Promise<StubData['ytd']> {
  const year = periodEnd.slice(0, 4);
  const archivedCol = table === 'driver_settlements' ? 'deleted_at' : 'archived_at';
  const taxCol = 'tax_withholding';
  const { data } = await db.from(table).select(`id, gross_pay, ${taxCol}, net_pay`).eq('org_id', orgId).eq(key, id).is(archivedCol, null).in('status', ['approved', 'paid']).gte('period_end', `${year}-01-01`).lte('period_end', periodEnd);
  const rows = ((data ?? []) as any[]).filter((r) => r.id !== current.id);
  return {
    gross: round2(rows.reduce((s, r) => s + (Number(r.gross_pay) || 0), 0) + current.gross),
    taxes: round2(rows.reduce((s, r) => s + (Number(r[taxCol]) || 0), 0) + current.taxes),
    net: round2(rows.reduce((s, r) => s + (Number(r.net_pay) || 0), 0) + current.net),
  };
}

export async function loadRunStubs(run: PayRun, items: PayRunItem[], orgId: string): Promise<StubData[]> {
  const out: StubData[] = [];
  for (const item of items) {
    if (item.source === 'settlement') {
      const [{ data: s }, { data: si }] = await Promise.all([
        db.from('driver_settlements').select('driver_id, period_start, period_end, gross_pay, reimbursements, deductions, tax_withholding, net_pay, tax_calculation').eq('id', item.source_id).single(),
        db.from('driver_settlement_items').select('item_type, description, amount').eq('settlement_id', item.source_id).order('item_type'),
      ]);
      if (!s) continue;
      const ytd = await ytdFor('driver_settlements', 'driver_id', s.driver_id, orgId, s.period_end, { id: item.source_id, gross: Number(s.gross_pay) || 0, taxes: Number(s.tax_withholding) || 0, net: Number(s.net_pay) || 0 });
      out.push(stubFromSettlement({ item, run, period: { start: s.period_start, end: s.period_end }, items: (si ?? []) as any[], taxCalculation: s.tax_calculation, ytd, gross: Number(s.gross_pay) || 0, nonTaxable: Number(s.reimbursements) || 0, deductions: Number(s.deductions) || 0, net: Number(s.net_pay) || 0 }));
    } else {
      const { data: s } = await db.from('staff_pay_statements').select('user_id, period_start, period_end, gross_pay, tax_withholding, net_pay, lines, tax_calculation').eq('id', item.source_id).single();
      if (!s) continue;
      const ytd = await ytdFor('staff_pay_statements', 'user_id', s.user_id, orgId, s.period_end, { id: item.source_id, gross: Number(s.gross_pay) || 0, taxes: Number(s.tax_withholding) || 0, net: Number(s.net_pay) || 0 });
      out.push(stubFromStatement({ item, run, period: { start: s.period_start, end: s.period_end }, lines: (s.lines ?? []) as any[], taxCalculation: s.tax_calculation, ytd }));
    }
  }
  return out;
}

/** One line per person for the payroll register, in the order the pay is read: pay, reimbursed, taxes, deductions, take-home. */
export function registerRows(stubs: StubData[]) {
  return stubs.map((s) => ({
    name: s.name,
    kind: s.payeeKind,
    period: `${s.periodStart} to ${s.periodEnd}`,
    gross: s.gross,
    nonTaxable: s.nonTaxable,
    taxTotal: s.taxTotal,
    deductionTotal: s.deductionTotal,
    net: s.net,
    employerTotal: round2(s.employerTaxes.reduce((t, l) => t + l.amount, 0)),
    ytdGross: s.ytd.gross,
  }));
}
