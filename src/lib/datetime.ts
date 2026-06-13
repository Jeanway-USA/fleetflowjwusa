/**
 * Centralized appointment-time helpers.
 *
 * Storage contract (set by the 2026-06-13 migration):
 *   - load.pickup_at / delivery_at   : timestamptz (true UTC instant)
 *   - load.pickup_tz / delivery_tz   : IANA timezone of that stop ('America/Chicago')
 *   - legacy load.pickup_date / pickup_time / delivery_date / delivery_time
 *     are kept and dual-written for one release.
 *
 * The Core memory rule "append T00:00:00 to YYYY-MM-DD before parsing to
 * prevent timezone shifting" still applies for pure date-only fields. This
 * module's helpers handle it internally.
 */

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/** Best-effort IANA → friendly label (display only; abbreviation comes from Intl). */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain – no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Detroit', label: 'Eastern (Detroit)' },
  { value: 'America/Indiana/Indianapolis', label: 'Eastern (Indianapolis)' },
  { value: 'America/Boise', label: 'Mountain (Boise)' },
  { value: 'America/Toronto', label: 'Eastern (Toronto)' },
  { value: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  { value: 'America/Edmonton', label: 'Mountain (Edmonton)' },
];

/** US state abbreviation → dominant IANA zone. Mirrors public.state_to_iana(). */
const STATE_TO_IANA: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York',
  LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver',
  NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', SD: 'America/Chicago',
  TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
  ON: 'America/Toronto', QC: 'America/Toronto', BC: 'America/Vancouver',
  AB: 'America/Edmonton', MB: 'America/Winnipeg', SK: 'America/Regina',
};

/**
 * Guess an IANA timezone from a free-text location like "Dallas, TX 75201".
 * Returns null when the state can't be parsed — callers should fall back to
 * the org's company_timezone.
 */
export function guessTimezoneFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location.split(',');
  const tail = parts[parts.length - 1]?.trim() ?? '';
  const st = tail.slice(0, 2).toUpperCase();
  return STATE_TO_IANA[st] ?? null;
}

/** Combine a wall-clock date + time in `tz` into a true UTC ISO string. */
export function combineToUtc(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  tz: string
): string | null {
  if (!dateStr) return null;
  const safeTime = normalizeTimeString(timeStr) || '00:00';
  try {
    const utc = fromZonedTime(`${dateStr}T${safeTime}:00`, tz);
    return utc.toISOString();
  } catch {
    return null;
  }
}

/** Split a UTC ISO back to wall-clock `{date, time}` in `tz` for form editing. */
export function splitFromUtc(
  utcIso: string | null | undefined,
  tz: string
): { date: string; time: string } | null {
  if (!utcIso) return null;
  try {
    return {
      date: formatInTimeZone(utcIso, tz, 'yyyy-MM-dd'),
      time: formatInTimeZone(utcIso, tz, 'HH:mm'),
    };
  } catch {
    return null;
  }
}

/** Accept "08:00", "8:00 AM", "15:50 PM" → "HH:mm". Returns null when unparseable. */
export function normalizeTimeString(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[:.]?\s*(\d{2})?\s*(AM|PM)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export interface FormattedStopTime {
  /** "Mon, Jun 15" */
  dateLabel: string;
  /** "08:00 CST" */
  timeLabel: string;
  /** "06:00 PDT" — only present when stopTz differs from the viewer's effective zone */
  secondaryLabel?: string;
  /** Full "Mon, Jun 15 · 08:00 CST" */
  full: string;
}

export interface FormatStopOptions {
  /** The zone the viewer's "effective" time should be expressed in (company or local). */
  viewerTz?: string;
  /** When true, only render the stop's own zone (no secondary line). Default false. */
  hideSecondary?: boolean;
  /** When true, omit the date label. */
  timeOnly?: boolean;
}

/**
 * Format a UTC instant for display. Always renders the time in the stop's
 * own zone with the abbreviation ("08:00 CST"); when `viewerTz` differs from
 * `stopTz`, also returns the same instant rendered in the viewer's zone so
 * the UI can show "(06:00 PDT)" beneath.
 */
export function formatStopTime(
  utcIso: string | null | undefined,
  stopTz: string | null | undefined,
  opts: FormatStopOptions = {}
): FormattedStopTime | null {
  if (!utcIso || !stopTz) return null;
  try {
    const dateLabel = formatInTimeZone(utcIso, stopTz, 'EEE, MMM d');
    const timeLabel = formatInTimeZone(utcIso, stopTz, 'HH:mm zzz');
    let secondaryLabel: string | undefined;
    if (
      !opts.hideSecondary &&
      opts.viewerTz &&
      opts.viewerTz !== stopTz
    ) {
      secondaryLabel = formatInTimeZone(utcIso, opts.viewerTz, 'HH:mm zzz');
    }
    return {
      dateLabel,
      timeLabel,
      secondaryLabel,
      full: opts.timeOnly ? timeLabel : `${dateLabel} · ${timeLabel}`,
    };
  } catch {
    return null;
  }
}

/** Detect the browser's IANA zone (fallback America/Chicago when unavailable). */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}
