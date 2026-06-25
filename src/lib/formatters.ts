import { format, parseISO } from 'date-fns';

/**
 * Format a number as USD currency.
 * Returns '$0.00' for null/undefined values.
 */
export function formatCurrency(value: number | null | undefined, options?: { maximumFractionDigits?: number }): string {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: options?.maximumFractionDigits,
  }).format(value);
}

/**
 * Format an ISO date string to MM/dd/yyyy.
 * Returns '-' for null/undefined values.
 */
export function formatDate(date: string | null | undefined, formatStr: string = 'MM/dd/yyyy'): string {
  if (!date) return '-';
  return format(parseISO(date), formatStr);
}

/**
 * Get driver full name from a drivers array by ID.
 * Returns '-' if not found or null.
 */
export function getDriverName(
  driverId: string | null | undefined,
  drivers: Array<{ id: string; first_name: string; last_name: string }>
): string {
  if (!driverId) return '-';
  const driver = drivers.find(d => d.id === driverId);
  return driver ? `${driver.first_name} ${driver.last_name}` : '-';
}

/**
 * Get truck unit number from a trucks array by ID.
 * Returns '-' if not found or null.
 */
export function getTruckUnit(
  truckId: string | null | undefined,
  trucks: Array<{ id: string; unit_number: string }>
): string {
  if (!truckId) return '-';
  const truck = trucks.find(t => t.id === truckId);
  return truck ? `#${truck.unit_number}` : '-';
}

/**
 * Get truck unit number (without #) from trucks array by ID.
 */
export function getTruckName(
  truckId: string | null | undefined,
  trucks: Array<{ id: string; unit_number: string }>
): string {
  if (!truckId) return '-';
  const truck = trucks.find(t => t.id === truckId);
  return truck?.unit_number || '-';
}

/**
 * Format a Notice of Assignment string for factoring invoices.
 * Returns null if provider name is not provided.
 */
export function formatNoticeOfAssignment(
  providerName: string | null | undefined,
  remitAddress: string | null | undefined
): string | null {
  if (!providerName) return null;
  let notice = `Notice of Assignment: Pay to ${providerName}`;
  if (remitAddress) {
    notice += `\n${remitAddress}`;
  }
  return notice;
}

/**
 * Convert a positive USD amount to an English words string like
 * "Two Thousand Four Hundred and 00/100 — USD".
 */
export function numberToEnglishUsd(value: number | null | undefined): string {
  const n = Math.abs(Number(value ?? 0));
  const dollars = Math.floor(n);
  const cents = Math.round((n - dollars) * 100);
  const centsStr = String(cents).padStart(2, '0');
  const words = dollars === 0 ? 'Zero' : intToWords(dollars);
  return `${words} and ${centsStr}/100 — USD`;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function intToWords(num: number): string {
  if (num === 0) return 'Zero';
  let i = 0;
  let result = '';
  let n = num;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const chunkText = chunkToWords(chunk);
      result = `${chunkText}${SCALES[i] ? ' ' + SCALES[i] : ''}${result ? ' ' + result : ''}`;
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return result.trim();
}

function chunkToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    parts.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t]);
  }
  return parts.join(' ');
}
