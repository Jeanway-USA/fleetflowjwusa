// Landstar Rule 670 Over-Dimension surcharge calculator.
// Bands live in public.over_dimension_rules per org. Each band carries:
//   - cents_per_mile (stored as DOLLARS per mile, e.g. 0.40 = 40¢)
//   - min_charge (dollar floor per single dimension)
// Per Rule 670 Note 1: when a load is oversize on multiple dimensions, charge
// only the SINGLE highest of the three (not the sum).

export const LEGAL_HEIGHT_INCHES = 13 * 12 + 6; // 13'6"
export const LEGAL_WIDTH_INCHES  = 8 * 12 + 6;  // 8'6"
export const LEGAL_LENGTH_INCHES = 70 * 12;     // 70'0"

export type OverDimRule = {
  dimension: 'height' | 'width' | 'length';
  min_inches: number;
  max_inches: number | null;
  cents_per_mile: number | string;
  min_charge?: number | string | null;
};

export type OverDimInput = {
  height_inches?: number | null;
  width_inches?: number | null;
  length_inches?: number | null;
  miles: number;
  rules: OverDimRule[];
};

export type OverDimBreakdownItem = {
  dimension: 'height' | 'width' | 'length';
  value_in: number;
  cpm: number;
  min_charge: number;
  miles: number;
  subtotal: number;
};

export type OverDimResult = {
  height_cpm: number;
  width_cpm: number;
  length_cpm: number;
  total_cpm: number; // for backward-compat: the highest single cpm applied
  charge_amount: number;
  breakdown: OverDimBreakdownItem[];
  /** Dimension whose charge was applied (Rule 670 Note 1). */
  applied_dimension: 'height' | 'width' | 'length' | null;
};

const LEGAL: Record<'height' | 'width' | 'length', number> = {
  height: LEGAL_HEIGHT_INCHES,
  width:  LEGAL_WIDTH_INCHES,
  length: LEGAL_LENGTH_INCHES,
};

function matchBand(
  dimension: 'height' | 'width' | 'length',
  value: number,
  rules: OverDimRule[]
): { cpm: number; min_charge: number } {
  if (!value || value <= LEGAL[dimension]) return { cpm: 0, min_charge: 0 };
  const candidates = rules
    .filter(
      (r) =>
        r.dimension === dimension &&
        value >= r.min_inches &&
        (r.max_inches == null || value <= r.max_inches)
    )
    .map((r) => ({
      cpm: Number(r.cents_per_mile) || 0,
      min_charge: Number(r.min_charge ?? 0) || 0,
    }));
  if (candidates.length === 0) return { cpm: 0, min_charge: 0 };
  // Highest cpm wins; pair it with the corresponding min_charge from that band.
  return candidates.reduce((best, c) => (c.cpm > best.cpm ? c : best), candidates[0]);
}

function chargeFor(
  dimension: 'height' | 'width' | 'length',
  value: number,
  miles: number,
  rules: OverDimRule[]
): OverDimBreakdownItem | null {
  const { cpm, min_charge } = matchBand(dimension, value, rules);
  if (cpm <= 0 && min_charge <= 0) return null;
  const subtotal = round2(Math.max(min_charge, cpm * miles));
  if (subtotal <= 0) return null;
  return { dimension, value_in: value, cpm, min_charge, miles, subtotal };
}

export function calcOverDimensionCharge(input: OverDimInput): OverDimResult {
  const h = Number(input.height_inches) || 0;
  const w = Number(input.width_inches) || 0;
  const l = Number(input.length_inches) || 0;
  const miles = Math.max(0, Number(input.miles) || 0);

  const items = [
    chargeFor('height', h, miles, input.rules),
    chargeFor('width',  w, miles, input.rules),
    chargeFor('length', l, miles, input.rules),
  ].filter((x): x is OverDimBreakdownItem => x !== null);

  // Rule 670 Note 1: only the single highest dimension is charged.
  const winner = items.reduce<OverDimBreakdownItem | null>(
    (best, item) => (best == null || item.subtotal > best.subtotal ? item : best),
    null
  );

  const height_cpm = items.find((i) => i.dimension === 'height')?.cpm ?? 0;
  const width_cpm  = items.find((i) => i.dimension === 'width')?.cpm  ?? 0;
  const length_cpm = items.find((i) => i.dimension === 'length')?.cpm ?? 0;

  return {
    height_cpm,
    width_cpm,
    length_cpm,
    total_cpm: winner ? winner.cpm : 0,
    charge_amount: winner ? winner.subtotal : 0,
    breakdown: items, // shows all dims so the UI can explain which won
    applied_dimension: winner ? winner.dimension : null,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// Helpers for the UI feet+inches input
export function toInches(feet: number, inches: number): number {
  const f = Math.max(0, Math.floor(feet || 0));
  const i = Math.max(0, Math.floor(inches || 0));
  return f * 12 + i;
}
export function fromInches(total: number | null | undefined): { feet: number; inches: number } {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return { feet: Math.floor(t / 12), inches: t % 12 };
}
export function formatFeetInches(total: number | null | undefined): string {
  if (!total || total <= 0) return '—';
  const { feet, inches } = fromInches(total);
  return `${feet}'${inches}"`;
}

export const OVER_DIM_ACCESSORIAL_TYPE = 'Over-Dimension (Rule 670)';
export const OVER_DIM_AUTO_NOTE_PREFIX = 'Auto:';

// Rule 500: detention dollar calculation with daily cap.
export function calcDetentionCharge(
  hours: number,
  hourlyRate: number,
  maxPerDay: number
): number {
  const h = Math.max(0, Number(hours) || 0);
  const r = Math.max(0, Number(hourlyRate) || 0);
  const cap = Math.max(0, Number(maxPerDay) || 0);
  if (h <= 0 || r <= 0) return 0;
  const days = Math.ceil(h / 24);
  const uncapped = h * r;
  if (cap <= 0) return round2(uncapped);
  return round2(Math.min(uncapped, cap * days));
}
