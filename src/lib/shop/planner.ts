import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { ManufacturerService, TruckWithSchedules } from '@/hooks/useMaintenanceData';

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

export type DutyCycle = 'normal' | 'heavy' | 'severe';

/** Oil intervals shorten with harder work. Volvo and Mack publish 60,000 / 45,000 / 35,000 mi; the factors match those. */
const DUTY_FACTOR: Record<DutyCycle, number> = { normal: 1, heavy: 0.75, severe: 0.6 };

/** Whether a manufacturer service is the engine oil and filter service, the one that depends on engine and duty. */
export function isOilService(make: string, code: string): boolean {
  const m = make.trim().toLowerCase();
  const c = code.toUpperCase();
  if (m === 'freightliner' || m === 'western star') return c === 'PM_A';
  if (m === 'international') return c === 'CLASS_B';
  return c === 'PM_B';
}

/**
 * The oil interval for one truck. A Cummins engine in a truck built by someone else follows Cummins' own table
 * (about 60,000 mi at normal duty; verify), then the duty cycle shortens it. Other engines keep the make's interval.
 */
export function oilInterval(base: number, engine: string | null | undefined, duty: string | null | undefined): number {
  const e = (engine ?? '').trim().toLowerCase();
  const start = e === 'cummins' ? 60000 : base;
  const factor = DUTY_FACTOR[(duty as DutyCycle) ?? 'normal'] ?? 1;
  return Math.round((start * factor) / 1000) * 1000;
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
  // Every other maker service is its own kind of job, so finishing it resets that service and not the oil change.
  if (/^(PM_|CLASS_)/.test(c) || ['ANNUAL_DOT', 'AIR_DRYER', 'DPF_CLEAN', 'DEF_FILTER', 'COOLANT', 'TRANS_FLUID', 'AXLE_FLUID'].includes(c)) return c;
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

/**
 * One maker service as a plan item. A service with both miles and months is due at whichever comes first, so the
 * item shown is the one closer to its limit. Months only count once there is a record of when it was last done.
 */
function manufacturerItem(t: TruckWithSchedules, s: ManufacturerService, today: Date): PlannerItem | null {
  const p = s.profile;
  const kind = kindFor(p.service_code, p.service_name);
  const miles = p.interval_miles ? (isOilService(t.make ?? '', p.service_code) ? oilInterval(p.interval_miles, t.engine_make, t.duty_cycle) : p.interval_miles) : null;
  const candidates: PlannerItem[] = [];
  if (miles) candidates.push(item(t, p.service_name, kind, 'miles', s.miles_since_service, miles));
  if (p.interval_days) {
    if (s.baseline.date) candidates.push(item(t, p.service_name, kind, 'days', differenceInCalendarDays(today, parseISO(s.baseline.date)), p.interval_days));
    else if (!miles) candidates.push(item(t, p.service_name, kind, 'days', p.interval_days + 1, p.interval_days));
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.remaining / a.interval <= b.remaining / b.interval ? a : b));
}

/** Every service coming due on every truck, as one flat list the screen can sort and group. */
export function buildPlanner(trucks: TruckWithSchedules[], today: Date = new Date()): PlannerItem[] {
  const out: PlannerItem[] = [];
  for (const t of trucks) {
    for (const s of t.manufacturer_services) {
      const one = manufacturerItem(t, s, today);
      if (one) out.push(one);
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
