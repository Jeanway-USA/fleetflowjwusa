import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/formatters';
import {
  DATE_FORMATS, DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE, formatOrgDate, getOrgDateFormat, isValidTimezone, setOrgDateFormat, timezoneOptions, toDateFormat, toTimezone, todayInTimezone,
} from '@/lib/display-settings';

afterEach(() => setOrgDateFormat(null));

describe('date formats', () => {
  it('offers the three formats the settings page shows, with US style as the default', () => {
    expect(DATE_FORMATS.map((f) => f.label)).toEqual(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']);
    expect(DEFAULT_DATE_FORMAT).toBe('MM/dd/yyyy');
  });
  it('accepts a saved value only if it is one we offer', () => {
    expect(toDateFormat('dd/MM/yyyy')).toBe('dd/MM/yyyy');
    expect(toDateFormat('yyyy-MM-dd')).toBe('yyyy-MM-dd');
    expect(toDateFormat(null)).toBe('MM/dd/yyyy');
    expect(toDateFormat(undefined)).toBe('MM/dd/yyyy');
    expect(toDateFormat('')).toBe('MM/dd/yyyy');
    expect(toDateFormat('mm-dd-yyyy')).toBe('MM/dd/yyyy'); // the old placeholder key was never saved
    expect(toDateFormat('MMMM do, yyyy')).toBe('MM/dd/yyyy');
  });
  it('writes a date in each format, and a dash when there is none', () => {
    expect(formatOrgDate('2026-11-21', 'MM/dd/yyyy')).toBe('11/21/2026');
    expect(formatOrgDate('2026-11-21', 'dd/MM/yyyy')).toBe('21/11/2026');
    expect(formatOrgDate('2026-11-21', 'yyyy-MM-dd')).toBe('2026-11-21');
    expect(formatOrgDate(null)).toBe('-');
    expect(formatOrgDate('')).toBe('-');
    expect(formatOrgDate('not a date')).toBe('-');
  });
  it('does not shift a date across midnight', () => {
    expect(formatOrgDate('2026-01-01', 'dd/MM/yyyy')).toBe('01/01/2026');
    expect(formatOrgDate('2026-12-31', 'dd/MM/yyyy')).toBe('31/12/2026');
  });
  it('reads a full timestamp as well as a date', () => {
    expect(formatOrgDate(new Date(2026, 10, 21), 'dd/MM/yyyy')).toBe('21/11/2026');
  });
});

describe('the format in use', () => {
  it('is US style until a company chooses, so nothing changes for companies that never open settings', () => {
    expect(getOrgDateFormat()).toBe('MM/dd/yyyy');
    expect(formatDate('2026-11-21')).toBe('11/21/2026');
    expect(formatOrgDate('2026-11-21')).toBe('11/21/2026');
  });
  it("makes the app's shared formatDate follow the company's choice", () => {
    setOrgDateFormat('dd/MM/yyyy');
    expect(formatDate('2026-11-21')).toBe('21/11/2026');
    setOrgDateFormat('yyyy-MM-dd');
    expect(formatDate('2026-11-21')).toBe('2026-11-21');
  });
  it('still honours a format a call site asks for by name', () => {
    setOrgDateFormat('dd/MM/yyyy');
    expect(formatDate('2026-11-21', 'MM/dd')).toBe('11/21');
  });
  it('ignores a value it does not recognise', () => {
    setOrgDateFormat('garbage');
    expect(getOrgDateFormat()).toBe('MM/dd/yyyy');
  });
});

describe('time zones', () => {
  it('Central is the default', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/Chicago');
    expect(toTimezone(null)).toBe('America/Chicago');
    expect(toTimezone('')).toBe('America/Chicago');
    expect(toTimezone(undefined)).toBe('America/Chicago');
  });
  it('keeps a real zone and replaces one that is not', () => {
    expect(toTimezone('America/Denver')).toBe('America/Denver');
    expect(toTimezone('Pacific/Honolulu')).toBe('Pacific/Honolulu');
    expect(toTimezone('america-new_york')).toBe('America/Chicago'); // the old placeholder values are not real zones
    expect(toTimezone('Mars/Olympus')).toBe('America/Chicago');
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('america-chicago')).toBe(false);
  });
  it('offers the common zones, and a saved zone that is not among them so it is not lost', () => {
    expect(timezoneOptions('America/Chicago').map((z) => z.value)).toContain('America/Chicago');
    const odd = timezoneOptions('America/Winnipeg');
    expect(odd.some((z) => z.value === 'America/Winnipeg')).toBe(true);
    expect(timezoneOptions('America/Chicago')).toHaveLength(timezoneOptions(null).length);
  });
  it("gives the company's calendar day, not the viewer's", () => {
    const late = new Date('2026-11-22T03:30:00Z'); // 9:30 pm Nov 21 in Chicago, 6:30 pm Nov 21 in LA, already Nov 22 in UTC
    expect(todayInTimezone('America/Chicago', late)).toBe('2026-11-21');
    expect(todayInTimezone('America/Los_Angeles', late)).toBe('2026-11-21');
    expect(todayInTimezone('Pacific/Honolulu', late)).toBe('2026-11-21');
    expect(todayInTimezone('America/New_York', late)).toBe('2026-11-21'); // 10:30 pm
    expect(todayInTimezone('Europe/London', late)).toBe('2026-11-22');
  });
});
