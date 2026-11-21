import { calculateRevenue, roundCents, type RevenueSettings } from '@/lib/revenue-calculator';
import { defaultAccessorialPercentage } from '@/lib/accessorials';

/**
 * Logic behind the rate confirmation review: why a parse failed in plain words, which extracted fields to double
 * check, what the load is worth to the truck (using the same calculator the load form uses), and whether the trip is
 * already in the system. Kept apart from the screens so it can be tested.
 */

// ---------- parse failures ----------

export type ParseFailureKind = 'not_pdf' | 'too_big' | 'unreadable' | 'not_rate_con' | 'timeout' | 'busy' | 'credits' | 'forbidden' | 'upload' | 'unknown';

export interface ParseFailure {
  kind: ParseFailureKind;
  title: string;
  /** What happened and what to do next. */
  detail: string;
  /** A retry may work (timeouts, busy service, a dropped connection). */
  retryable: boolean;
}

/** Turns whatever the reader or the network said into one specific, actionable explanation. */
export function classifyParseFailure(raw: unknown): ParseFailure {
  const message = (raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '').trim();
  const m = message.toLowerCase();

  if (/please upload a pdf|not a pdf|only pdf/.test(m)) {
    return { kind: 'not_pdf', title: 'That is not a PDF', detail: 'Rate confirmations are read from PDF files. Save or print the rate confirmation as a PDF and drop that file here.', retryable: false };
  }
  if (/exceeds|too large|under 5mb|20 mb|413/.test(m)) {
    return { kind: 'too_big', title: 'The PDF is too large', detail: 'Keep it under 5 MB. A scan at lower quality, or just the rate confirmation pages, will do.', retryable: false };
  }
  if (/timed out|timeout|took too long|deadline|504|gateway/.test(m)) {
    return { kind: 'timeout', title: 'Reading the PDF took too long', detail: 'The reader did not answer in time. Try again; if it keeps happening, enter the load by hand.', retryable: true };
  }
  if (/rate limit|429|try again in a moment/.test(m)) {
    return { kind: 'busy', title: 'The reader is busy', detail: 'Too many files were read at once. Wait a moment and try again.', retryable: true };
  }
  if (/credits|402|payment required/.test(m)) {
    return { kind: 'credits', title: 'The PDF reader is out of credits', detail: 'The reading service cannot take more files until its credits are topped up. Enter this load by hand for now.', retryable: false };
  }
  if (/forbidden|unauthorized|invalid authentication|insufficient permissions|401|403/.test(m)) {
    return { kind: 'forbidden', title: 'You cannot read rate confirmations with this login', detail: 'Sign in again. If it still fails, the owner needs to check your role.', retryable: false };
  }
  if (/failed to upload file|storage|bucket|row-level security/.test(m)) {
    return { kind: 'upload', title: 'The file could not be sent for reading', detail: 'The upload failed before the PDF was read. Check the connection and try again.', retryable: true };
  }
  if (/failed to parse extracted data|no response from ai|empty|could not read|corrupt|invalid pdf|encrypted|password/.test(m)) {
    return { kind: 'unreadable', title: 'The PDF could not be read', detail: 'It may be a blank page, a password-protected file or a very poor scan. Open it to check, then try a clearer copy, or enter the load by hand.', retryable: false };
  }
  if (/not a rate con|no load|nothing to extract|does not appear/.test(m)) {
    return { kind: 'not_rate_con', title: 'This does not look like a rate confirmation', detail: 'No Landstar load details were found in it. Use the Landstar rate confirmation or load detail PDF.', retryable: false };
  }
  return { kind: 'unknown', title: 'The rate confirmation could not be processed', detail: message ? `${message}. Try again, or enter the load by hand.` : 'Try again, or enter the load by hand.', retryable: true };
}

/** A parse that returned data but found nothing that makes it a load. */
export function looksLikeRateCon(data: { landstar_load_id?: string | null; origin?: string | null; destination?: string | null; rate?: number | null } | null | undefined): boolean {
  if (!data) return false;
  const hits = [data.landstar_load_id, data.origin, data.destination].filter((v) => !!(v && String(v).trim())).length + (data.rate ? 1 : 0);
  return hits >= 2;
}

// ---------- which fields to check ----------

export type ReviewLevel = 'ok' | 'low' | 'missing';

export interface ReviewFlag {
  key: string;
  label: string;
  level: ReviewLevel;
  /** 0 to 100 when the reader scored the field. */
  confidence: number | null;
  required: boolean;
}

interface ReviewableData {
  landstar_load_id?: string | null;
  agency_code?: string | null;
  origin?: string | null;
  destination?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  rate?: number | null;
  fuel_surcharge?: number | null;
  booked_miles?: number | null;
  pickup_number?: string | null;
  confidence?: Record<string, number> | null;
}

/** Below this the reader was not sure of the value. */
export const LOW_CONFIDENCE = 80;

const REVIEW_FIELDS: Array<{ key: keyof ReviewableData; label: string; required: boolean; /** id of the matching input on the load form */ inputId: string }> = [
  { key: 'landstar_load_id', label: 'Landstar load ID', required: true, inputId: 'landstar_load_id' },
  { key: 'agency_code', label: 'Agent code', required: true, inputId: 'agency_code' },
  { key: 'origin', label: 'Pickup address', required: true, inputId: 'origin' },
  { key: 'destination', label: 'Delivery address', required: true, inputId: 'destination' },
  { key: 'pickup_date', label: 'Pickup date', required: true, inputId: 'pickup_date' },
  { key: 'delivery_date', label: 'Delivery date', required: false, inputId: 'delivery_date' },
  { key: 'rate', label: 'Linehaul', required: true, inputId: 'rate' },
  { key: 'fuel_surcharge', label: 'Fuel surcharge', required: false, inputId: 'fuel_surcharge' },
  { key: 'booked_miles', label: 'Booked miles', required: false, inputId: 'booked_miles' },
  { key: 'pickup_number', label: 'Pickup number', required: false, inputId: 'pickup_number' },
];

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !(v > 0));

/**
 * Every field worth a second look: missing ones (always for the required fields) and ones the reader scored under
 * the threshold. `fuel_surcharge` and the optional fields are only flagged when the reader scored them low, since
 * a load can legitimately have none.
 */
export function reviewFlags(data: ReviewableData): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  for (const f of REVIEW_FIELDS) {
    const score = typeof data.confidence?.[f.key as string] === 'number' ? (data.confidence![f.key as string] as number) : null;
    const empty = isEmpty(data[f.key]);
    if (empty && f.required) flags.push({ key: f.key as string, label: f.label, level: 'missing', confidence: score, required: true });
    else if (!empty && score !== null && score < LOW_CONFIDENCE) flags.push({ key: f.key as string, label: f.label, level: 'low', confidence: score, required: f.required });
  }
  return flags;
}

/** The ids of the load-form inputs to highlight for these flags. */
export function flaggedInputIds(flags: ReviewFlag[]): string[] {
  return flags.map((f) => REVIEW_FIELDS.find((r) => r.key === f.key)?.inputId).filter((id): id is string => !!id);
}

export function flagText(f: ReviewFlag): string {
  return f.level === 'missing'
    ? `${f.label}: not found in the PDF`
    : `${f.label}: the reader is ${f.confidence !== null ? `${Math.round(f.confidence)}% sure` : 'not sure'}`;
}

// ---------- money preview ----------

export interface CompanySettingRow {
  setting_key: string;
  setting_value: string | null;
}

export function revenueSettingsFrom(rows: CompanySettingRow[]): RevenueSettings & { truckPctDisplay: number; trailerPctDisplay: number; powerOnlyPctDisplay: number } {
  const get = (key: string, fallback: string) => rows.find((r) => r.setting_key === key)?.setting_value || fallback;
  const num = (key: string, fallback: string) => {
    const n = parseFloat(get(key, fallback));
    return Number.isFinite(n) ? n : parseFloat(fallback);
  };
  const truck = num('truck_percentage', '65');
  const trailer = num('trailer_percentage', '7');
  const powerOnly = num('power_only_percentage', '70');
  return {
    truckPct: truck / 100,
    trailerPct: trailer / 100,
    advancePct: num('advance_percentage', '30') / 100,
    ownsTrailer: get('owns_trailer', 'false') === 'true',
    powerOnlyPct: powerOnly / 100,
    truckPctDisplay: truck,
    trailerPctDisplay: trailer,
    powerOnlyPctDisplay: powerOnly,
  };
}

export interface MoneyPreview {
  /** What the load bills in all: linehaul + fuel surcharge + accessorials. */
  gross: number;
  linehaul: number;
  /** The truck's share of linehaul (the Landstar split, 65% by default). */
  linehaulShare: number;
  fuelSurcharge: number;
  /** Accessorials after the truck's share of each (stop-off pay is paid at the linehaul share). */
  accessorials: number;
  trailerShare: number;
  /** Landstar's cut of linehaul. */
  landstarCut: number;
  /** What the truck earns on the load, before advances. */
  net: number;
  truckPctDisplay: number;
  usesPowerOnly: boolean;
}

/**
 * The truck's money on a load as it stands in the rate confirmation, worked out by the same calculator the load form
 * uses, so the preview and the saved load cannot disagree. FSC is paid 100% to the truck; the split applies to linehaul.
 */
export function previewMoney(
  data: { rate?: number | null; fuel_surcharge?: number | null; accessorials?: Array<{ type: string; amount: number }> | null; is_power_only?: boolean },
  settings: ReturnType<typeof revenueSettingsFrom>,
): MoneyPreview {
  const rate = Number(data.rate) || 0;
  const fsc = Number(data.fuel_surcharge) || 0;
  const linehaulPct = settings.truckPctDisplay;
  const accessorials = roundCents(
    (data.accessorials ?? []).reduce((sum, a) => {
      const type = a.type === 'Stop Of' ? 'Stop-off' : a.type;
      return sum + (Number(a.amount) || 0) * (defaultAccessorialPercentage(type, linehaulPct) / 100);
    }, 0),
  );
  const grossAccessorials = roundCents((data.accessorials ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0));
  const result = calculateRevenue(
    { rate, fuel_surcharge: fsc, lumper: 0, advance_taken: 0, is_power_only: !!data.is_power_only, accessorialsTotal: accessorials },
    settings,
  );
  const share = data.is_power_only ? settings.powerOnlyPct ?? 0.7 : settings.truckPct;
  const linehaulShare = roundCents(rate * share);
  return {
    gross: roundCents(rate + fsc + grossAccessorials),
    linehaul: roundCents(rate),
    linehaulShare,
    fuelSurcharge: roundCents(fsc),
    accessorials,
    trailerShare: result.trailer_revenue,
    landstarCut: roundCents(rate - linehaulShare),
    net: result.net_revenue,
    truckPctDisplay: data.is_power_only ? settings.powerOnlyPctDisplay : settings.truckPctDisplay,
    usesPowerOnly: !!data.is_power_only,
  };
}

// ---------- duplicates ----------

export interface TripMatchLoad {
  id: string;
  landstar_load_id: string | null;
  origin?: string | null;
  destination?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** An existing, live load carrying this Landstar trip number, if any. Cancelled and deleted loads do not count. */
export function findTripMatch<T extends TripMatchLoad>(loads: T[], tripId: string | null | undefined): T | null {
  const id = norm(tripId);
  if (!id) return null;
  return loads.find((l) => !l.deleted_at && l.status !== 'cancelled' && norm(l.landstar_load_id) === id) ?? null;
}
