import { supabase } from '@/integrations/supabase/client';

export type SettlementPayType = 'flat' | 'per_mile' | 'percentage' | 'other';

export interface BreakdownLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string | null;
  destination: string | null;
  rate: number | null;
  booked_miles: number | null;
  actual_miles: number | null;
  delivery_date: string | null;
  pickup_date: string | null;
  status: string | null;
}

export interface PayBreakdown {
  payType: SettlementPayType;
  payRate: number; // raw driver pay_rate
  truckSplit: number; // 0..1 (e.g. 0.65)
  loads: BreakdownLoad[]; // ordered by delivery/pickup date
  totalLoadedMiles: number; // sum of (booked ?? actual) over delivered loads
  totalLinehaul: number; // sum of load.rate
  totalAfterSplit: number; // percentage only: sum(rate*split)
  basePay: number; // gross_pay equivalent before reimbursements
  methodLabel: string; // chip text
  formulaLabel: string; // long-form e.g. "1,842 mi × $0.65/mi = $1,197.30"
}

const DEFAULT_SPLIT = 0.65;

export function normalizePayType(pt?: string | null): SettlementPayType {
  const t = (pt ?? '').toLowerCase();
  if (t === 'flat') return 'flat';
  if (t === 'per_mile' || t === 'cpm') return 'per_mile';
  if (t === 'percentage') return 'percentage';
  return 'other';
}

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtMiles = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export async function fetchPayBreakdown(
  settlement: {
    id: string;
    org_id: string;
    driver_id: string;
    period_start: string;
    period_end: string;
    gross_pay: number | null;
  },
  driver: { pay_type: string | null; pay_rate: number | null } | null | undefined,
): Promise<PayBreakdown> {
  const payType = normalizePayType(driver?.pay_type);
  const payRate = Number(driver?.pay_rate ?? 0);

  const { data: splitRow } = await supabase
    .from('company_settings')
    .select('setting_value')
    .eq('org_id', settlement.org_id)
    .eq('setting_key', 'truck_percentage')
    .maybeSingle();
  let split = DEFAULT_SPLIT;
  if (splitRow?.setting_value) {
    const raw = parseFloat(String(splitRow.setting_value).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(raw) && raw > 0) split = raw > 1 ? raw / 100 : raw;
  }

  // For flat drivers we want in-transit + delivered loads in the period;
  // for cpm/percentage we want delivered only.
  const wantsInTransit = payType === 'flat';
  let q = supabase
    .from('fleet_loads')
    .select(
      'id, landstar_load_id, origin, destination, rate, booked_miles, actual_miles, delivery_date, pickup_date, status',
    )
    .eq('org_id', settlement.org_id)
    .eq('driver_id', settlement.driver_id);

  if (wantsInTransit) {
    q = q
      .in('status', ['delivered', 'in_transit'])
      .lte('pickup_date', settlement.period_end)
      .or(
        `delivery_date.is.null,delivery_date.gte.${settlement.period_start}`,
      );
  } else {
    q = q
      .eq('status', 'delivered')
      .gte('delivery_date', settlement.period_start)
      .lte('delivery_date', settlement.period_end);
  }

  const { data: loadRows } = await q;
  const loads = ((loadRows ?? []) as BreakdownLoad[]).sort((a, b) => {
    const da = a.delivery_date ?? a.pickup_date ?? '';
    const db = b.delivery_date ?? b.pickup_date ?? '';
    return da.localeCompare(db);
  });

  const totalLoadedMiles = loads.reduce(
    (s, l) => s + Number(l.booked_miles ?? l.actual_miles ?? 0),
    0,
  );
  const totalLinehaul = loads.reduce((s, l) => s + Number(l.rate ?? 0), 0);
  const totalAfterSplit = totalLinehaul * split;
  const basePay = Number(settlement.gross_pay ?? 0);

  let methodLabel = '—';
  let formulaLabel = '';

  if (payType === 'flat') {
    methodLabel = 'Flat Rate';
    formulaLabel = `Flat Rate Base Pay = ${fmtMoney(payRate)}`;
  } else if (payType === 'per_mile') {
    methodLabel = `Cost Per Mile @ $${payRate.toFixed(2)}/mi`;
    formulaLabel = `${fmtMiles(totalLoadedMiles)} loaded mi × $${payRate.toFixed(2)}/mi = ${fmtMoney(basePay)}`;
  } else if (payType === 'percentage') {
    methodLabel = `Percentage @ ${payRate}%`;
    formulaLabel = `${fmtMoney(totalAfterSplit)} (after ${(split * 100).toFixed(0)}% truck split) × ${payRate}% = ${fmtMoney(basePay)}`;
  } else {
    methodLabel = 'Custom';
    formulaLabel = `Base Pay = ${fmtMoney(basePay)}`;
  }

  return {
    payType,
    payRate,
    truckSplit: split,
    loads,
    totalLoadedMiles,
    totalLinehaul,
    totalAfterSplit,
    basePay,
    methodLabel,
    formulaLabel,
  };
}
