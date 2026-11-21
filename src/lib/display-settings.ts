import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { COMMON_TIMEZONES } from '@/lib/datetime';

/**
 * The company's display settings: the time zone company-level dates are in, and how dates are written in lists, settlements
 * and reports. Both are chosen in Settings, Company, and saved on the organization. Until a company chooses, they are
 * Central time and US-style dates, which is what the app always showed.
 */

export const DEFAULT_TIMEZONE = 'America/Chicago';

/** The date formats a company can choose. The value is the date-fns pattern, so it can be passed straight to `format`. */
export const DATE_FORMATS = [
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY', hint: 'Month first, as written in the US' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY', hint: 'Day first' },
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD', hint: 'Year first, sorts correctly' },
] as const;

export type DateFormatPattern = (typeof DATE_FORMATS)[number]['value'];
export const DEFAULT_DATE_FORMAT: DateFormatPattern = 'MM/dd/yyyy';

/** A saved value as one of the offered patterns, or the default when it is missing or not one we offer. */
export function toDateFormat(value: unknown): DateFormatPattern {
  return DATE_FORMATS.some((f) => f.value === value) ? (value as DateFormatPattern) : DEFAULT_DATE_FORMAT;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A saved value as an IANA time zone, or Central time when it is missing or not a real zone. */
export function toTimezone(value: unknown): string {
  return isValidTimezone(value) ? value.trim() : DEFAULT_TIMEZONE;
}

/** The zones to offer, plus the one already saved if it is not in the common list, so saving never silently changes it. */
export function timezoneOptions(current: string | null | undefined): Array<{ value: string; label: string }> {
  const list = [...COMMON_TIMEZONES];
  if (current && !list.some((z) => z.value === current)) list.push({ value: current, label: current.replace(/_/g, ' ') });
  return list;
}

/** Today's date (YYYY-MM-DD) in a given zone: the company's day, not the viewer's browser's. */
export function todayInTimezone(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, toTimezone(tz), 'yyyy-MM-dd');
}

// The format in use right now. The settings hook updates it when the company's setting loads or changes, so the shared
// formatDate follows the company's choice without every call site having to ask.
let current: DateFormatPattern = DEFAULT_DATE_FORMAT;

/** The company's date format (a date-fns pattern). US style until the company chooses another. */
export const getOrgDateFormat = (): DateFormatPattern => current;
export function setOrgDateFormat(value: unknown): void {
  current = toDateFormat(value);
}

/** An ISO date (YYYY-MM-DD) or Date written in the company's format. "-" when there is no date. */
export function formatOrgDate(date: string | Date | null | undefined, pattern: string = current): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? parseISO(date.length === 10 ? `${date}T00:00:00` : date) : date;
  return Number.isNaN(d.getTime()) ? '-' : format(d, pattern);
}
