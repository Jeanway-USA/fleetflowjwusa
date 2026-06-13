// Landstar Rule 670 Over-Dimension surcharge calculator.
// Legal limits are hard-coded; CPM bands live in public.over_dimension_rules per org.

export const LEGAL_HEIGHT_INCHES = 13 * 12 + 6; // 13'6" = 162
export const LEGAL_WIDTH_INCHES  = 8 * 12 + 6;  // 8'6"  = 102
export const LEGAL_LENGTH_INCHES = 70 * 12;     // 70'   = 840

export type OverDimRule = {
  dimension: 'height' | 'width' | 'length';
  min_inches: number;
  max_inches: number | null;
  cents_per_mile: number | string;
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
  miles: number;
  subtotal: number;
};

export type OverDimResult = {
  height_cpm: number;
  width_cpm: number;
  length_cpm: number;
  total_cpm: number;
  charge_amount: number;
  breakdown: OverDimBreakdownItem[];
};

const LEGAL: Record<'height' | 'width' | 'length', number> = {
  height: LEGAL_HEIGHT_INCHES,
  width:  LEGAL_WIDTH_INCHES,
  length: LEGAL_LENGTH_INCHES,
};

function matchCpm(
  dimension: 'height' | 'width' | 'length',
  value: number,
  rules: OverDimRule[]
): number {
  if (!value || value <= LEGAL[dimension]) return 0;
  const candidates = rules
    .filter((r) => r.dimension === dimension && value >= r.min_inches && (r.max_inches == null || value <= r.max_inches))
    .map((r) => Number(r.cents_per_mile) || 0);
  if (candidates.length === 0) return 0;
  // Highest matching band wins (handles overlapping ranges defensively).
  return Math.max(...candidates);
}

export function calcOverDimensionCharge(input: OverDimInput): OverDimResult {
  const h = Number(input.height_inches) || 0;
  const w = Number(input.width_inches) || 0;
  const l = Number(input.length_inches) || 0;
  const miles = Math.max(0, Number(input.miles) || 0);

  const height_cpm = matchCpm('height', h, input.rules);
  const width_cpm  = matchCpm('width',  w, input.rules);
  const length_cpm = matchCpm('length', l, input.rules);

  const breakdown: OverDimBreakdownItem[] = [];
  if (height_cpm > 0) breakdown.push({ dimension: 'height', value_in: h, cpm: height_cpm, miles, subtotal: round2(height_cpm * miles) });
  if (width_cpm  > 0) breakdown.push({ dimension: 'width',  value_in: w, cpm: width_cpm,  miles, subtotal: round2(width_cpm  * miles) });
  if (length_cpm > 0) breakdown.push({ dimension: 'length', value_in: l, cpm: length_cpm, miles, subtotal: round2(length_cpm * miles) });

  const total_cpm = round4(height_cpm + width_cpm + length_cpm);
  const charge_amount = miles > 0 ? round2(total_cpm * miles) : 0;

  return { height_cpm, width_cpm, length_cpm, total_cpm, charge_amount, breakdown };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }

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
