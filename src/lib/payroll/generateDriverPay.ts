import { supabase } from '@/integrations/supabase/client';
import { applyW2WithholdingToSettlements } from '@/lib/payroll/applySettlementWithholding';
import { defaultTaxYearConfig } from '@/lib/payroll/taxTables';
import type { StaffTaxContext } from '@/lib/payroll/staffTax';
import { driversOnPackages, generatePackageSettlements, loadPackageContext, type PackageContext } from '@/lib/pay-packages/generate';

/**
 * Makes draft settlements for drivers and applies W-2 withholding to them. This is the one place that does it: the
 * Generate Settlements dialog and the Pay Run both call it, so they can never pay the same driver two different ways.
 *
 * Drivers on a pay package are paid from it. Everyone else goes through the original generator. If the package tables
 * are not set up yet, every driver is paid the original way.
 */
export interface DriverPayResult {
  rows: any[];
  packageSkipped: Array<{ driverId: string; reason: string }>;
  withheld: { w2Count: number; totalWithheld: number };
  /** Net pay after withholding, read back from the saved settlements. */
  finalNet: number;
}

export async function generateDriverPay(args: {
  orgId: string;
  userId: string | null;
  driverIds: string[];
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  taxContext: Pick<StaffTaxContext, 'statesByCode' | 'payFrequency'> & { defaultTaxState: string };
  /** True when every driver on the roster is being paid, which lets the original generator pick the drivers itself. */
  allSelected?: boolean;
}): Promise<DriverPayResult> {
  const { orgId, userId, driverIds, periodStart, periodEnd, paymentDate, taxContext, allSelected = false } = args;

  let context: PackageContext | null = null;
  try {
    context = await loadPackageContext();
  } catch {
    context = null;
  }
  const onPackage = context ? driversOnPackages(driverIds, context, periodEnd) : new Set<string>();
  const legacyIds = driverIds.filter((id) => !onPackage.has(id));

  const rows: any[] = [];
  let packageSkipped: DriverPayResult['packageSkipped'] = [];
  if (legacyIds.length > 0) {
    const targetIds = onPackage.size === 0 && allSelected ? null : legacyIds;
    const { data, error } = await supabase.rpc('generate_driver_settlements', {
      _driver_ids: targetIds,
      _period_start: periodStart,
      _period_end: periodEnd,
      _payment_date: paymentDate,
    });
    if (error) throw error;
    rows.push(...((data ?? []) as any[]));
  }
  if (onPackage.size > 0 && context) {
    const made = await generatePackageSettlements({
      orgId, userId, driverIds: Array.from(onPackage), periodStart, periodEnd, paymentDate, context, replaceDrafts: true,
    });
    rows.push(...made.rows);
    packageSkipped = made.skipped;
  }

  // Auto-apply W-2 withholding (contractors are left untouched).
  let withheld = { w2Count: 0, totalWithheld: 0 };
  if (rows.length) {
    withheld = await applyW2WithholdingToSettlements(rows, {
      orgId,
      config: defaultTaxYearConfig(Number(periodEnd.slice(0, 4))),
      statesByCode: taxContext.statesByCode,
      payFrequency: taxContext.payFrequency,
      defaultTaxState: taxContext.defaultTaxState,
    });
  }
  // The rows above were read before withholding was applied, so read the pay back.
  let finalNet = rows.reduce((s, r: any) => s + Number(r.net_pay ?? 0), 0);
  if (rows.length > 0) {
    const { data: fresh } = await supabase.from('driver_settlements').select('net_pay').in('id', rows.map((r: any) => r.id));
    if (fresh) finalNet = fresh.reduce((s, r) => s + Number(r.net_pay ?? 0), 0);
  }
  return { rows, packageSkipped, withheld, finalNet };
}
