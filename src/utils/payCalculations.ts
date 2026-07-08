/**
 * SINGLE SOURCE OF TRUTH for driver pay calculations.
 *
 * Every driver-pay number rendered in the app MUST flow through this module.
 * Do NOT inline pay math anywhere else. If a new pay type is needed,
 * extend this file and update its test.
 *
 * Pay-type math (gross):
 *   percentage : ((rate * landstarSplit) * driverPct/100) + accessorials
 *                - FSC is EXCLUDED from the percentage base.
 *                - In Independent Owner-Operator mode the landstarSplit is 1.0.
 *   per_mile/cpm : (booked_miles * pay_rate) + accessorials
 *   flat        : (weekly_flat_rate) + accessorials across delivered loads in period.
 *                 Per-load pay returns only that load's accessorials.
 *   hourly      : (hoursWorked * hourly_rate). No per-load component.
 *
 * Employment-type routing (net):
 *   w2_company        : Net = Gross - (Gross * w2WithholdingRate). Any pay type
 *                       is legal (per_mile, percentage, flat, hourly). Gross is
 *                       computed the same way as contractor; only tax withholding
 *                       differentiates the tracks. Statutory deductions are
 *                       modeled as a single effective withholding rate (default
 *                       22%, configurable via settings.w2WithholdingRate).
 *   1099_contractor /
 *   lease_purchase    : Net = Gross + Reimbursements - Deductions. No tax
 *                       withholding (contractor handles their own taxes).
 *                       Reimbursements/Deductions live on the settlement, not
 *                       on a single load — they are applied in calculateWeeklyPay.
 *                       For lease_purchase drivers, deductions flagged as
 *                       escrow are mirrored to lease_purchase_agreements.current_escrow_balance
 *                       inside the DB recalc_settlement_totals function.
 */

export type CanonicalPayType = 'percentage' | 'per_mile' | 'flat' | 'hourly';

export type DriverPayType = CanonicalPayType | 'cpm' | string | null | undefined;

export type TmsMode = 'landstar' | 'independent';

export type EmploymentType =
  | 'w2_company'
  | '1099_contractor'
  | 'lease_purchase';

/** Math bucket: W-2 has tax withheld; everyone else is contractor-style. */
export type EmploymentClass = 'w2' | 'contractor';

export const DEFAULT_W2_WITHHOLDING = 0.22;

export interface PayDriver {
  pay_type: DriverPayType;
  pay_rate: number | null | undefined;
  /** Optional override; falls back to pay_rate for flat drivers. */
  weekly_flat_rate?: number | null;
  /** Optional override; falls back to pay_rate for hourly drivers. */
  hourly_rate?: number | null;
  /** Drives W-2 vs contractor net-pay routing. Defaults to contractor when missing. */
  employment_type?: EmploymentType | null;
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
  /**
   * Effective withholding rate (0..1) applied to W-2 driver gross pay.
   * Falls back to DEFAULT_W2_WITHHOLDING.
   */
  w2WithholdingRate?: number;
}

export interface PayBreakdown {
  base: number;
  accessorialsTotal: number;
  /** Gross pay (same as `grossPay`; kept for backwards compatibility). */
  total: number;
  grossPay: number;
  taxWithholding: number;
  netPay: number;
  payType: CanonicalPayType | 'unknown';
  employmentClass: EmploymentClass;
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

/**
 * W-2 drivers run on the statutory-withholding track. Contractors and
 * lease-purchase operators run on the gross-minus-deductions track.
 * Missing/unknown employment_type defaults to contractor for backwards compat.
 */
export function classifyEmployment(
  driver?: { employment_type?: EmploymentType | null } | null,
): EmploymentClass {
  return driver?.employment_type === 'w2_company' ? 'w2' : 'contractor';
}

function effectiveW2Withholding(settings?: PaySettings): number {
  const r = settings?.w2WithholdingRate;
  if (r == null || !Number.isFinite(r) || r < 0) return DEFAULT_W2_WITHHOLDING;
  return r > 1 ? r / 100 : r;
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

function buildBreakdown(args: {
  base: number;
  accessorialsTotal: number;
  payType: CanonicalPayType | 'unknown';
  driver?: PayDriver | null;
  settings?: PaySettings;
  formulaLabel: string;
}): PayBreakdown {
  const employmentClass = classifyEmployment(args.driver);
  const grossPay = args.base + args.accessorialsTotal;
  const taxWithholding =
    employmentClass === 'w2'
      ? Math.round(grossPay * effectiveW2Withholding(args.settings) * 100) / 100
      : 0;
  // Reimbursements / deductions are settlement-level concepts and do not
  // belong to a single load — they fold in via calculateWeeklyPay.
  const netPay = grossPay - taxWithholding;
  return {
    base: args.base,
    accessorialsTotal: args.accessorialsTotal,
    total: grossPay,
    grossPay,
    taxWithholding,
    netPay,
    payType: args.payType,
    employmentClass,
    formulaLabel: args.formulaLabel,
  };
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
    return buildBreakdown({
      base: 0,
      accessorialsTotal,
      payType: type,
      driver,
      settings,
      formulaLabel: '—',
    });
  }

  if (type === 'percentage') {
    const split = effectiveLandstarSplit(settings);
    const base = n(load.rate) * split * (rate / 100);
    return buildBreakdown({
      base,
      accessorialsTotal,
      payType: 'percentage',
      driver,
      settings,
      formulaLabel:
        settings?.tmsMode === 'independent'
          ? `${rate}% of rate + accessorials`
          : `${rate}% of (rate × ${(split * 100).toFixed(0)}% split) + accessorials`,
    });
  }

  if (type === 'per_mile') {
    const base = n(load.booked_miles) * rate;
    return buildBreakdown({
      base,
      accessorialsTotal,
      payType: 'per_mile',
      driver,
      settings,
      formulaLabel: `${n(load.booked_miles).toLocaleString()} mi × $${rate.toFixed(2)} + accessorials`,
    });
  }

  if (type === 'flat' || type === 'hourly') {
    // Flat/hourly are paid by period, not per load. Per-load slice = accessorials only.
    return buildBreakdown({
      base: 0,
      accessorialsTotal,
      payType: type,
      driver,
      settings,
      formulaLabel: type === 'flat' ? 'Flat weekly + accessorials' : 'Hourly + accessorials',
    });
  }

  return buildBreakdown({
    base: 0,
    accessorialsTotal,
    payType: 'unknown',
    driver,
    settings,
    formulaLabel: '—',
  });
}

export interface WeeklyPayInput {
  loads: Array<PayLoad>;
  driver: PayDriver | null | undefined;
  settings?: PaySettings;
  /** Required for hourly drivers. */
  hoursWorked?: number | null;
  /**
   * Settlement-level reimbursements and deductions (contractor / lease only).
   * For W-2, statutory tax withholding is applied automatically; these fields
   * are ignored on the W-2 track because W-2 pay does not carry contractor-style
   * deductions through this engine.
   */
  reimbursements?: number | null;
  deductions?: number | null;
}

export interface WeeklyPayResult {
  base: number;
  accessorialsTotal: number;
  /** Gross (kept for backwards compatibility). */
  total: number;
  grossPay: number;
  taxWithholding: number;
  reimbursements: number;
  deductions: number;
  netPay: number;
  loadCount: number;
  totalMiles: number;
  payType: CanonicalPayType | 'unknown';
  employmentClass: EmploymentClass;
}

/**
 * Pay for a set of loads (typically a pay period).
 * For flat drivers, base = weekly_flat_rate (or pay_rate fallback).
 * For hourly drivers, base = hoursWorked * hourly_rate (or pay_rate).
 * For percentage / per_mile, base is the sum of per-load base pay.
 * Accessorials are always summed across the loads.
 * W-2 gross = base + accessorials, minus statutory withholding.
 * Contractor gross = base + accessorials, plus reimbursements, minus deductions.
 */
export function calculateWeeklyPay({
  loads,
  driver,
  settings,
  hoursWorked,
  reimbursements,
  deductions,
}: WeeklyPayInput): WeeklyPayResult {
  const type = normalizePayType(driver?.pay_type);
  const employmentClass = classifyEmployment(driver);
  const loadArr = loads ?? [];
  const accessorialsTotal = loadArr.reduce((s, l) => s + sumAccessorials(l), 0);
  const totalMiles = loadArr.reduce((s, l) => s + n(l.booked_miles), 0);
  const loadCount = loadArr.length;

  if (!driver) {
    return {
      base: 0,
      accessorialsTotal,
      total: accessorialsTotal,
      grossPay: accessorialsTotal,
      taxWithholding: 0,
      reimbursements: 0,
      deductions: 0,
      netPay: accessorialsTotal,
      loadCount,
      totalMiles,
      payType: type,
      employmentClass,
    };
  }

  // Compute base uniformly across employment classes.
  let base = 0;
  if (type === 'flat') {
    base = n(driver.weekly_flat_rate ?? driver.pay_rate);
  } else if (type === 'hourly') {
    base = n(hoursWorked) * n(driver.hourly_rate ?? driver.pay_rate);
  } else if (type === 'per_mile' || type === 'percentage') {
    for (const load of loadArr) {
      const { base: b } = calculateLoadPay(load, driver, settings);
      base += b;
    }
  }
  // unknown → base stays 0

  // W-2 track: statutory withholding on gross taxable wages.
  if (employmentClass === 'w2') {
    const grossPay = base + accessorialsTotal;
    const taxWithholding =
      Math.round(grossPay * effectiveW2Withholding(settings) * 100) / 100;
    return {
      base,
      accessorialsTotal,
      total: grossPay,
      grossPay,
      taxWithholding,
      reimbursements: 0,
      deductions: 0,
      netPay: grossPay - taxWithholding,
      loadCount,
      totalMiles,
      payType: type,
      employmentClass: 'w2',
    };
  }


  // Contractor / lease track: gross + reimbursements - deductions.
  const grossPay = base + accessorialsTotal;
  const reimb = Math.max(0, n(reimbursements));
  const ded = Math.max(0, n(deductions));
  const netPay = grossPay + reimb - ded;

  return {
    base,
    accessorialsTotal,
    total: grossPay,
    grossPay,
    taxWithholding: 0,
    reimbursements: reimb,
    deductions: ded,
    netPay,
    loadCount,
    totalMiles,
    payType: type,
    employmentClass: 'contractor',
  };
}
