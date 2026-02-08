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
