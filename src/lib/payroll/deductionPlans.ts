import { supabase } from '@/integrations/supabase/client';
import {
  afterTaxDeductions,
  disposableEarnings,
  preTaxDeductions,
  type AppliedDeduction,
  type CatchUp,
  type DeductionKind,
  type DeductionPlan,
} from '@/lib/payroll/deductions';
import type { PayFrequency } from '@/lib/payroll/types';

const db = supabase as any;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Standing deduction plans (insurance, 401(k), garnishments, loans) for a person, and the step that applies them to one
 * paycheck. The plans table comes from docs/APPLY_DEDUCTIONS.sql. Until it is applied, nobody has plans and pay is
 * generated exactly as before.
 */

export type PayeeKind = 'driver' | 'employee';

export interface PlanRecord extends DeductionPlan {
  payeeType: PayeeKind;
  payeeId: string;
  archivedAt: string | null;
  caseReference?: string | null;
  payTo?: string | null;
}

export function planFromRow(r: any, collected = 0, ytdThisYear = 0): PlanRecord {
  return {
    id: r.id,
    payeeType: r.payee_type,
    payeeId: r.payee_id,
    kind: r.kind as DeductionKind,
    label: r.label,
    method: r.method,
    amount: Number(r.amount) || 0,
    employerAmount: Number(r.employer_amount) || 0,
    startDate: r.start_date,
    endDate: r.end_date ?? null,
    totalToCollect: r.total_to_collect == null ? null : Number(r.total_to_collect),
    collected,
    ytdThisYear,
    priority: r.priority ?? undefined,
    catchUp: ((r.catch_up as CatchUp | null) ?? 'none'),
    familyCoverage: !!r.family_coverage,
    annualLimitOverride: r.annual_limit_override == null ? null : Number(r.annual_limit_override),
    supportingFamily: !!r.supporting_family,
    arrearsOver12Weeks: !!r.arrears_over_12_weeks,
    levyExemptPerPeriod: r.levy_exempt_per_period == null ? undefined : Number(r.levy_exempt_per_period),
    note: r.note ?? undefined,
    archivedAt: r.archived_at ?? null,
    caseReference: r.case_reference ?? null,
    payTo: r.pay_to ?? null,
  };
}

export interface AppliedRow { plan_id: string; source: 'settlement' | 'staff_statement'; source_id: string; amount: number; pay_date: string }

/**
 * What each plan has collected in total and so far this year. The ledger keeps a row for every draft that was ever made,
 * so only rows whose statement is still live (not archived) are counted.
 */
export async function loadLedger(planIds: string[], year: number, skipSourceIds: string[] = []): Promise<Map<string, { collected: number; ytd: number }>> {
  const out = new Map<string, { collected: number; ytd: number }>();
  if (planIds.length === 0) return out;
  const { data, error } = await db.from('payroll_deduction_applied').select('plan_id, source, source_id, amount, pay_date').in('plan_id', planIds);
  if (error) throw error;
  const rows = ((data ?? []) as AppliedRow[]).filter((r) => !skipSourceIds.includes(r.source_id));
  const live = new Set<string>();
  const settlementIds = rows.filter((r) => r.source === 'settlement').map((r) => r.source_id);
  const statementIds = rows.filter((r) => r.source === 'staff_statement').map((r) => r.source_id);
  if (settlementIds.length) {
    const { data: s } = await db.from('driver_settlements').select('id').in('id', settlementIds).is('deleted_at', null);
    for (const x of (s ?? []) as any[]) live.add(x.id);
  }
  if (statementIds.length) {
    const { data: s } = await db.from('staff_pay_statements').select('id').in('id', statementIds).is('archived_at', null);
    for (const x of (s ?? []) as any[]) live.add(x.id);
  }
  for (const r of rows) {
    if (!live.has(r.source_id)) continue;
    const cur = out.get(r.plan_id) ?? { collected: 0, ytd: 0 };
    cur.collected = round2(cur.collected + Number(r.amount));
    if (String(r.pay_date).slice(0, 4) === String(year)) cur.ytd = round2(cur.ytd + Number(r.amount));
    out.set(r.plan_id, cur);
  }
  return out;
}

/**
 * The live plans for some people, with balances and year-to-date filled in. Returns an empty map when the plans table is
 * not set up yet, so pay still generates.
 */
export async function loadPlansFor(orgId: string, payeeType: PayeeKind, payeeIds: string[], year: number, skipSourceIds: string[] = []): Promise<Map<string, PlanRecord[]>> {
  const out = new Map<string, PlanRecord[]>();
  if (payeeIds.length === 0) return out;
  const { data, error } = await db.from('payroll_deduction_plans').select('*').eq('org_id', orgId).eq('payee_type', payeeType).in('payee_id', payeeIds).is('archived_at', null);
  if (error) return out;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return out;
  const ledger = await loadLedger(rows.map((r) => r.id), year, skipSourceIds);
  for (const r of rows) {
    const l = ledger.get(r.id);
    const list = out.get(r.payee_id) ?? [];
    list.push(planFromRow(r, l?.collected ?? 0, l?.ytd ?? 0));
    out.set(r.payee_id, list);
  }
  return out;
}

export interface PlanPayOutcome<T> {
  /** The tax result, run with the before-tax deductions in. */
  result: T;
  applied: AppliedDeduction[];
  /** Everything the plans took, before and after tax. */
  planTotal: number;
  employerContributions: number;
  warnings: string[];
}

/**
 * Pure: applies a person's plans to one paycheck in the right order.
 *  1. Before-tax deductions lower the pay each tax is figured on.
 *  2. Taxes are worked out; the pay left after them is the disposable pay the garnishment limits use.
 *  3. After-tax deductions come out of what remains, garnishments first, never below zero.
 * `calc` runs the tax engine with the given before-tax amounts and total other deductions.
 */
export function applyPlansToPay<T extends { totalEmployeeWithholding: number; audit: any }>(args: {
  gross: number;
  /** Reimbursements and other pay that is not taxed. */
  nonTaxable: number;
  /** Deductions already on the statement that did not come from a plan. */
  otherDeductions: number;
  payDate: string;
  frequency: PayFrequency;
  plans: DeductionPlan[];
  calc: (preTax: { fit: number; fica: number; futa: number; state: number }, otherDeductions: number) => T;
}): PlanPayOutcome<T> {
  const { gross, nonTaxable, otherDeductions, payDate, frequency, plans } = args;
  const pre = preTaxDeductions({ gross, payDate, plans });
  const preTotal = round2(pre.applied.reduce((s, a) => s + a.amount, 0));
  const first = args.calc(pre.preTax, round2(otherDeductions + preTotal));
  const tax = first.totalEmployeeWithholding;
  const post = afterTaxDeductions({
    gross,
    available: round2(gross + nonTaxable - otherDeductions - preTotal - tax),
    disposable: disposableEarnings(gross, tax),
    payDate,
    frequency,
    plans,
  });
  const postTotal = round2(post.applied.reduce((s, a) => s + a.amount, 0));
  const applied = [...pre.applied, ...post.applied];
  const planTotal = round2(preTotal + postTotal);
  const result = postTotal === 0 ? first : args.calc(pre.preTax, round2(otherDeductions + planTotal));
  if (applied.length > 0) {
    result.audit = {
      ...result.audit,
      payrollDeductions: applied.map((a) => ({ planId: a.planId, kind: a.kind, label: a.label, amount: a.amount, preTax: a.preTax, employerAmount: a.employerAmount, ...(a.note ? { note: a.note } : {}) })),
    };
  }
  return { result, applied, planTotal, employerContributions: pre.employerContributions, warnings: [...pre.warnings, ...post.warnings] };
}

/** Saves what a pay took against each plan, so balances and yearly limits stay exact. */
export async function recordApplied(args: { orgId: string; source: 'settlement' | 'staff_statement'; sourceId: string; payDate: string; applied: AppliedDeduction[] }) {
  if (args.applied.length === 0) return;
  const { error } = await db.from('payroll_deduction_applied').upsert(
    args.applied.map((a) => ({ org_id: args.orgId, plan_id: a.planId, source: args.source, source_id: args.sourceId, kind: a.kind, amount: a.amount, employer_amount: a.employerAmount, pay_date: args.payDate })),
    { onConflict: 'plan_id,source,source_id' },
  );
  if (error) throw error;
}
