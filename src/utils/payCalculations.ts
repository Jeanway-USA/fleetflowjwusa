/**
 * SINGLE SOURCE OF TRUTH for driver pay calculations.
 *
 * Every driver-pay number rendered in the app MUST flow through this module.
 * Do NOT inline pay math anywhere else. If a new pay type is needed,
 * extend this file and update its test.
 *
 * Rules:
 *   percentage : ((rate * landstarSplit) * driverPct/100) + accessorials
 *                - FSC is EXCLUDED from the percentage base.
 *                - In Independent Owner-Operator mode the landstarSplit is 1.0.
 *   per_mile/cpm : (booked_miles * pay_rate) + accessorials
 *   flat        : (weekly_flat_rate) + accessorials across delivered loads in period.
 *                 Per-load pay returns only that load's accessorials.
 *   hourly      : (hoursWorked * hourly_rate). No per-load component.
 */

export type CanonicalPayType = 'percentage' | 'per_mile' | 'flat' | 'hourly';

export type DriverPayType = CanonicalPayType | 'cpm' | string | null | undefined;

export type TmsMode = 'landstar' | 'independent';

export interface PayDriver {
  pay_type: DriverPayType;
  pay_rate: number | null | undefined;
  /** Optional override; falls back to pay_rate for flat drivers. */
  weekly_flat_rate?: number | null;
  /** Optional override; falls back to pay_rate for hourly drivers. */
  hourly_rate?: number | null;
}

export interface PayLoad {
  rate?: number | null;
  fuel_surcharge?: number | null;
  booked_miles?: number | null;
  load_accessorials?: Array<{ amount?: number | null; is_driver_pay?: boolean | null }> | null;
}

export interface PaySettings {
  /**
   * Landstar pre-split applied to the linehaul rate before the driver's
   * percentage. Default 0.65. Only applied when tmsMode === 'landstar'.
   * Read from org `company_settings.truck_percentage` (divided by 100).
   */
  landstarSplit?: number;
  tmsMode?: TmsMode;
}

export interface PayBreakdown {
  base: number;
  accessorialsTotal: number;
  total: number;
  payType: CanonicalPayType | 'unknown';
  formulaLabel: string;
}

const DEFAULT_LANDSTAR_SPLIT = 0.65;

const n = (v: unknown): number => {
  const num = Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
};

export function normalizePayType(pt: DriverPayType): CanonicalPayType | 'unknown' {
  const t = (pt || '').toString().toLowerCase();
  if (t === 'percentage') return 'percentage';
  if (t === 'per_mile' || t === 'cpm') return 'per_mile';
  if (t === 'flat') return 'flat';
  if (t === 'hourly') return 'hourly';
  return 'unknown';
}

export function sumAccessorials(load: PayLoad | null | undefined): number {
  if (!load?.load_accessorials) return 0;
  // Only driver-payable accessorials count toward driver pay.
  // `!== false` keeps legacy/undefined rows (default true) included.
  return load.load_accessorials
    .filter((a) => a?.is_driver_pay !== false)
    .reduce((s, a) => s + n(a?.amount), 0);
}

function effectiveLandstarSplit(settings?: PaySettings): number {
  const mode = settings?.tmsMode ?? 'landstar';
  if (mode === 'independent') return 1;
  const split = settings?.landstarSplit;
  if (split == null || !Number.isFinite(split) || split <= 0) return DEFAULT_LANDSTAR_SPLIT;
  return split;
}

/**
 * Pay for ONE load. For flat/hourly drivers per-load pay is only accessorials
 * (base earned weekly, not per-load).
 */
export function calculateLoadPay(
  load: PayLoad | null | undefined,
  driver: PayDriver | null | undefined,
  settings?: PaySettings,
): PayBreakdown {
  const accessorialsTotal = sumAccessorials(load);
  const type = normalizePayType(driver?.pay_type);
  const rate = n(driver?.pay_rate);

  if (!load || !driver) {
    return { base: 0, accessorialsTotal, total: accessorialsTotal, payType: type, formulaLabel: '—' };
  }

  if (type === 'percentage') {
    const split = effectiveLandstarSplit(settings);
    const base = n(load.rate) * split * (rate / 100);
    return {
      base,
      accessorialsTotal,
      total: base + accessorialsTotal,
      payType: 'percentage',
      formulaLabel:
        settings?.tmsMode === 'independent'
          ? `${rate}% of rate + accessorials`
          : `${rate}% of (rate × ${(split * 100).toFixed(0)}% split) + accessorials`,
    };
  }

  if (type === 'per_mile') {
    const base = n(load.booked_miles) * rate;
    return {
      base,
      accessorialsTotal,
      total: base + accessorialsTotal,
      payType: 'per_mile',
      formulaLabel: `${n(load.booked_miles).toLocaleString()} mi × $${rate.toFixed(2)} + accessorials`,
    };
  }

  if (type === 'flat' || type === 'hourly') {
    // Flat/hourly are paid by period, not per load. Per-load slice = accessorials only.
    return {
      base: 0,
      accessorialsTotal,
      total: accessorialsTotal,
      payType: type,
      formulaLabel: type === 'flat' ? 'Flat weekly + accessorials' : 'Hourly + accessorials',
    };
  }

  return { base: 0, accessorialsTotal, total: accessorialsTotal, payType: 'unknown', formulaLabel: '—' };
}

export interface WeeklyPayInput {
  loads: Array<PayLoad>;
  driver: PayDriver | null | undefined;
  settings?: PaySettings;
  /** Required for hourly drivers. */
  hoursWorked?: number | null;
}

export interface WeeklyPayResult {
  base: number;
  accessorialsTotal: number;
  total: number;
  loadCount: number;
  totalMiles: number;
  payType: CanonicalPayType | 'unknown';
}

/**
 * Pay for a set of loads (typically a pay period).
 * For flat drivers, base = weekly_flat_rate (or pay_rate fallback).
 * For hourly drivers, base = hoursWorked * hourly_rate (or pay_rate).
 * For percentage / per_mile, base is the sum of per-load base pay.
 * Accessorials are always summed across the loads.
 */
export function calculateWeeklyPay({
  loads,
  driver,
  settings,
  hoursWorked,
}: WeeklyPayInput): WeeklyPayResult {
  const type = normalizePayType(driver?.pay_type);
  const loadArr = loads ?? [];
  const accessorialsTotal = loadArr.reduce((s, l) => s + sumAccessorials(l), 0);
  const totalMiles = loadArr.reduce((s, l) => s + n(l.booked_miles), 0);
  const loadCount = loadArr.length;

  if (!driver) {
    return { base: 0, accessorialsTotal, total: accessorialsTotal, loadCount, totalMiles, payType: type };
  }

  if (type === 'flat') {
    const base = n(driver.weekly_flat_rate ?? driver.pay_rate);
    return { base, accessorialsTotal, total: base + accessorialsTotal, loadCount, totalMiles, payType: 'flat' };
  }

  if (type === 'hourly') {
    const rate = n(driver.hourly_rate ?? driver.pay_rate);
    const base = n(hoursWorked) * rate;
    return { base, accessorialsTotal, total: base + accessorialsTotal, loadCount, totalMiles, payType: 'hourly' };
  }

  // percentage / per_mile / unknown: sum per-load base, accessorials counted once.
  let base = 0;
  for (const load of loadArr) {
    const { base: b } = calculateLoadPay(load, driver, settings);
    base += b;
  }
  return {
    base,
    accessorialsTotal,
    total: base + accessorialsTotal,
    loadCount,
    totalMiles,
    payType: type,
  };
}
