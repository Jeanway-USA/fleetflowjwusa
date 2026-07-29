import { supabase } from '@/integrations/supabase/client';
import { calculatePayrollTaxes } from './taxEngine';
import { resolveDriverTaxProfiles } from './profiles';
import { loadYtdByDriver } from './ytd';
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
}

export interface ApplyWithholdingSummary {
  w2Count: number;
  totalWithheld: number;
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

  let w2Count = 0;
  let totalWithheld = 0;

  for (const row of rows) {
    const profile = profiles.get(row.driver_id);
    if (!profile || profile.employmentClass !== 'w2') continue;

    const stateCode = (profile.workState || ctx.defaultTaxState || '').toUpperCase();
    const state = ctx.statesByCode.get(stateCode) ?? null;
    const gross = (Number(row.gross_pay) || 0) + (Number(row.reimbursements) || 0);

    const result = calculatePayrollTaxes({
      grossTaxablePay: Number(row.gross_pay) || 0,
      otherDeductions: Number(row.deductions) || 0,
      profile,
      config: ctx.config,
      state,
      ytd: ytdMap.get(row.driver_id) ?? EMPTY_YTD,
      payFrequency: ctx.payFrequency,
    });

    const { error } = await supabase
      .from('driver_settlements')
      .update({
        tax_withholding: result.totalEmployeeWithholding,
        tax_calculation: JSON.parse(JSON.stringify(result.audit)) as never,
      })
      .eq('id', row.id);
    if (error) throw error;

    w2Count += 1;
    totalWithheld += result.totalEmployeeWithholding;
    void gross;
  }

  return { w2Count, totalWithheld: Math.round(totalWithheld * 100) / 100 };
}
