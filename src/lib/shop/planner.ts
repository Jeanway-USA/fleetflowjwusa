import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { TruckWithSchedules } from '@/hooks/useMaintenanceData';

export type PlanStatus = 'overdue' | 'soon' | 'ok';

export interface PlannerItem {
  truckId: string;
  unit: string;
  make: string;
  name: string;
  /** The kind of work to start a job for (matches the shop's work kinds). */
  kind: string;
  basis: 'miles' | 'days';
  used: number;
  interval: number;
  /** Miles or days left; negative when overdue. */
  remaining: number;
  status: PlanStatus;
}

const SOON_MILES = 1000;
const SOON_DAYS = 14;

export function statusFor(remaining: number, basis: 'miles' | 'days'): PlanStatus {
  if (remaining < 0) return 'overdue';
  return remaining <= (basis === 'miles' ? SOON_MILES : SOON_DAYS) ? 'soon' : 'ok';
}

/** Which kind of job a service means. */
export function kindFor(code: string | null | undefined, name: string): string {
  const c = (code ?? '').toUpperCase();
  if (['M1', 'M2', 'M3', 'PM_A'].includes(c)) return c;
  const n = name.toLowerCase();
  if (/tire/.test(n)) return 'tire';
  if (/inspect/.test(n)) return 'inspection';
  if (/brake/.test(n)) return 'brake';
  return 'pm';
}

const item = (t: TruckWithSchedules, name: string, kind: string, basis: 'miles' | 'days', used: number, interval: number): PlannerItem => ({
  truckId: t.id,
  unit: t.unit_number,
  make: t.make ?? '',
  name,
  kind,
  basis,
  used,
  interval,
  remaining: interval - used,
  status: statusFor(interval - used, basis),
});

/** Every service coming due on every truck, as one flat list the screen can sort and group. */
export function buildPlanner(trucks: TruckWithSchedules[], today: Date = new Date()): PlannerItem[] {
  const out: PlannerItem[] = [];
  for (const t of trucks) {
    for (const s of t.manufacturer_services) {
      out.push(item(t, s.profile.service_name, kindFor(s.profile.service_code, s.profile.service_name), 'miles', s.miles_since_service, s.profile.interval_miles || 25000));
    }
    // Trucks without a manufacturer plan fall back to the plain oil change schedule.
    const oil = t.schedules.find((s) => s.service_name === 'Oil Change');
    if (oil && t.manufacturer_services.length === 0) out.push(item(t, 'Oil change', 'pm', 'miles', t.miles_since_oil_change || 0, oil.interval_miles || 15000));
    const tire = t.schedules.find((s) => s.service_name === 'Tire Replacement');
    if (tire) out.push(item(t, 'Tire replacement', 'tire', 'miles', t.miles_since_tire_replacement || 0, tire.interval_miles || 80000));
    const insp = t.schedules.find((s) => s.service_name === '120-Day Inspection');
    if (insp) {
      const interval = insp.interval_days || 120;
      const used = insp.last_performed_date ? differenceInCalendarDays(today, parseISO(insp.last_performed_date)) : interval + 1;
      out.push(item(t, '120-day inspection', 'inspection', 'days', used, interval));
    }
  }
  return out;
}

const RANK: Record<PlanStatus, number> = { overdue: 0, soon: 1, ok: 2 };

/** Most overdue first, then the nearest due. Miles and days are compared as-is within the same status. */
export function sortPlan(items: PlannerItem[]): PlannerItem[] {
  return [...items].sort((a, b) => RANK[a.status] - RANK[b.status] || a.remaining - b.remaining || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
}

export function planCounts(items: PlannerItem[]) {
  return { overdue: items.filter((i) => i.status === 'overdue').length, soon: items.filter((i) => i.status === 'soon').length, ok: items.filter((i) => i.status === 'ok').length };
}

/** "1,240 mi left", "Overdue by 800 mi", "9 days left". */
export function remainingLabel(i: Pick<PlannerItem, 'remaining' | 'basis'>): string {
  const n = Math.abs(Math.round(i.remaining));
  const unit = i.basis === 'miles' ? 'mi' : n === 1 ? 'day' : 'days';
  const amount = i.basis === 'miles' ? n.toLocaleString() : String(n);
  return i.remaining < 0 ? `Overdue by ${amount} ${unit}` : `${amount} ${unit} left`;
}

/** The date a mileage-based service is expected to come due, given how far the truck runs a day. */
export function projectedDate(i: Pick<PlannerItem, 'remaining' | 'basis'>, avgDailyMiles: number, today: Date = new Date()): Date | null {
  if (i.basis === 'days') return new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(0, Math.round(i.remaining)));
  if (avgDailyMiles <= 0) return null;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(0, Math.round(i.remaining / avgDailyMiles)));
}
