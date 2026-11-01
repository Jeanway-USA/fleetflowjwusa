import { supabase } from '@/integrations/supabase/client';
import { calculatePayrollTaxes } from './taxEngine';
import { resolveDriverTaxProfiles } from './profiles';
import { loadYtdByDriver } from './ytd';
import { applyPlansToPay, loadPlansFor, recordApplied } from './deductionPlans';
import { EMPTY_YTD, type PayFrequency, type StateTaxConfig } from './types';
import type { TaxYearConfig } from './taxTables';

export interface SettlementRowLike {
  id: string;
  driver_id: string;
  gross_pay: number | null;
  reimbursements: number | null;
  deductions: number | null;
  period_end: string;
}

export interface ApplyWithholdingContext {
  orgId: string;
  config: TaxYearConfig;
  statesByCode: Map<string, StateTaxConfig>;
  payFrequency: PayFrequency;
  defaultTaxState: string;
  /** Off-cycle pay (a bonus or correction): income tax at the flat supplemental rate. */
  supplemental?: boolean;
}

export interface ApplyWithholdingSummary {
  w2Count: number;
  totalWithheld: number;
}

/**
 * Re-adds the year-to-date figures on a statement once its real withholding is in. They were first worked out
 * with a placeholder withholding rate, so YTD net would otherwise stay a little off. Archived statements are
 * left out, the same as everywhere else.
 */
async function refreshYtd(orgId: string, driverId: string, settlementId: string, periodEnd: string) {
  const year = periodEnd.slice(0, 4);
  const { data, error } = await supabase
    .from('driver_settlements')
    .select('gross_pay, reimbursements, deductions, net_pay')
    .eq('org_id', orgId)
    .eq('driver_id', driverId)
    .is('deleted_at', null)
    .gte('period_end', `${year}-01-01`)
    .lte('period_end', periodEnd);
  if (error) throw error;
  const sum = (pick: (r: { gross_pay: number | null; reimbursements: number | null; deductions: number | null; net_pay: number | null }) => number | null) =>
    Math.round((data ?? []).reduce((s, r) => s + (Number(pick(r)) || 0), 0) * 100) / 100;
  const { error: updateError } = await supabase
    .from('driver_settlements')
    .update({ ytd_gross: sum((r) => r.gross_pay), ytd_reimbursements: sum((r) => r.reimbursements), ytd_deductions: sum((r) => r.deductions), ytd_net: sum((r) => r.net_pay) })
    .eq('id', settlementId);
  if (updateError) throw updateError;
}

/**
 * Applies automatic W-2 withholding to freshly generated settlements.
 *
 * Contractor / lease-purchase drivers are left untouched (no withholding).
 * W-2 drivers get taxes from the shared engine, plus a full audit snapshot.
 */
export async function applyW2WithholdingToSettlements(
  rows: SettlementRowLike[],
  ctx: ApplyWithholdingContext,
): Promise<ApplyWithholdingSummary> {
  if (!rows.length) return { w2Count: 0, totalWithheld: 0 };

  const driverIds = Array.from(new Set(rows.map((r) => r.driver_id)));
  const [profiles, ytdMap] = await Promise.all([
    resolveDriverTaxProfiles(ctx.orgId, driverIds),
    loadYtdByDriver(ctx.orgId, ctx.config.tax_year),
  ]);

  // What is already on each statement, the pay date, and each driver's standing deduction plans.
  const rowIds = rows.map((r) => r.id);
  const anyDb = supabase as any;
  const [withPlan, { data: dateData }] = await Promise.all([
    anyDb.from('driver_settlement_items').select('id, settlement_id, item_type, amount, plan_id').in('settlement_id', rowIds),
    supabase.from('driver_settlements').select('id, payment_date, deductions').in('id', rowIds),
  ]);
  // Before docs/APPLY_DEDUCTIONS.sql is applied there is no plan_id column: nothing is from a plan.
  let itemData = withPlan.data as any[] | null;
  if (withPlan.error) {
    const plain = await anyDb.from('driver_settlement_items').select('id, settlement_id, item_type, amount').in('settlement_id', rowIds);
    itemData = ((plain.data ?? []) as any[]).map((i) => ({ ...i, plan_id: null }));
  }
  const existingItems = ((itemData ?? []) as Array<{ id: string; settlement_id: string; item_type: string; amount: number; plan_id: string | null }>);
  const payDates = new Map(((dateData ?? []) as Array<{ id: string; payment_date: string | null }>).filter((d) => d.payment_date).map((d) => [d.id, d.payment_date as string]));
  // The deductions saved right now (the rows passed in can be a step behind).
  const savedDeductions = new Map(((dateData ?? []) as Array<{ id: string; deductions: number | null }>).map((d) => [d.id, Number(d.deductions) || 0]));
  const plansByDriver = await loadPlansFor(ctx.orgId, 'driver', driverIds, ctx.config.tax_year, rowIds);

  let w2Count = 0;
  let totalWithheld = 0;

  for (const row of rows) {
    const profile = profiles.get(row.driver_id);
    if (!profile || profile.employmentClass !== 'w2') continue;

    const stateCode = (profile.workState || ctx.defaultTaxState || '').toUpperCase();
    const state = ctx.statesByCode.get(stateCode) ?? null;
    const gross = (Number(row.gross_pay) || 0) + (Number(row.reimbursements) || 0);

    const mine = existingItems.filter((i) => i.settlement_id === row.id);
    // Deductions that are not from a plan (fuel advances, repairs, escrow lines). Plan lines are worked out fresh.
    const fromPlans = mine.filter((i) => i.item_type === 'deduction' && i.plan_id).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const otherDeductions = Math.max(0, Math.round(((savedDeductions.get(row.id) ?? (Number(row.deductions) || 0)) - fromPlans) * 100) / 100);
    const grossPay = Number(row.gross_pay) || 0;
    const calc = (preTax: { fit: number; fica: number; futa: number; state: number }, other: number) => calculatePayrollTaxes({
      grossTaxablePay: grossPay,
      otherDeductions: other,
      profile,
      config: ctx.config,
      state,
      sitStateCode: profile.sitState ?? null,
      sitStateConfig: (profile.sitState && ctx.statesByCode.get(profile.sitState.toUpperCase())) || null,
      ytd: ytdMap.get(row.driver_id) ?? EMPTY_YTD,
      payFrequency: ctx.payFrequency,
      supplemental: ctx.supplemental,
      preTax,
    });

    const payDate = payDates.get(row.id) ?? row.period_end;
    const outcome = applyPlansToPay({
      gross: grossPay,
      nonTaxable: Number(row.reimbursements) || 0,
      otherDeductions,
      payDate,
      frequency: ctx.payFrequency,
      plans: plansByDriver.get(row.driver_id) ?? [],
      calc,
    });
    const result = outcome.result;

    // One line on the statement for each plan deduction. A line already there from an earlier pass is updated, not doubled.
    for (const a of outcome.applied) {
      const line = mine.find((i) => i.plan_id === a.planId);
      const description = a.note ? `${a.label} (${a.note})` : a.label;
      if (line) {
        const { error: lineError } = await supabase.from('driver_settlement_items').update({ amount: a.amount, description } as never).eq('id', line.id);
        if (lineError) throw lineError;
      } else if (a.amount > 0) {
        const { error: lineError } = await supabase.from('driver_settlement_items').insert({ settlement_id: row.id, org_id: ctx.orgId, item_type: 'deduction', description, amount: a.amount, plan_id: a.planId } as never);
        if (lineError) throw lineError;
      }
    }
    for (const stale of mine.filter((i) => i.plan_id && !outcome.applied.some((a) => a.planId === i.plan_id))) {
      const { error: lineError } = await supabase.from('driver_settlement_items').update({ amount: 0 } as never).eq('id', stale.id);
      if (lineError) throw lineError;
    }
    await recordApplied({ orgId: ctx.orgId, source: 'settlement', sourceId: row.id, payDate, applied: outcome.applied });

    const { error } = await supabase
      .from('driver_settlements')
      .update({
        deductions: Math.round((otherDeductions + outcome.planTotal) * 100) / 100,
        tax_withholding: result.totalEmployeeWithholding,
        tax_calculation: JSON.parse(JSON.stringify(result.audit)) as never,
      })
      .eq('id', row.id);
    if (error) throw error;

    await refreshYtd(ctx.orgId, row.driver_id, row.id, row.period_end);

    w2Count += 1;
    totalWithheld += result.totalEmployeeWithholding;
    void gross;
  }

  return { w2Count, totalWithheld: Math.round(totalWithheld * 100) / 100 };
}
