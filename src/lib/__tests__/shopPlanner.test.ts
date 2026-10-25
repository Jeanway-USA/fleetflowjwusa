import { describe, expect, it } from 'vitest';
import { buildPlanner, isOilService, kindFor, oilInterval, planCounts, projectedDate, remainingLabel, sortPlan, statusFor } from '@/lib/shop/planner';
import type { TruckWithSchedules } from '@/hooks/useMaintenanceData';

const today = new Date(2026, 9, 12);

const truck = (over: Partial<TruckWithSchedules> = {}): TruckWithSchedules => ({
  id: 't1', unit_number: '101', make: 'Freightliner', current_odometer: 200000, purchase_mileage: 0, calculated_odometer: 200000,
  miles_since_oil_change: 0, miles_since_tire_replacement: 0, oil_change_baseline: { workOrderId: null, date: null }, tire_replacement_baseline: { workOrderId: null, date: null },
  last_120_inspection_date: null, status: 'active', schedules: [], manufacturer_services: [], ...over,
});

describe('service status', () => {
  it('is overdue below zero, soon within 1,000 miles or 14 days, otherwise ok', () => {
    expect(statusFor(-1, 'miles')).toBe('overdue');
    expect(statusFor(1000, 'miles')).toBe('soon');
    expect(statusFor(1001, 'miles')).toBe('ok');
    expect(statusFor(14, 'days')).toBe('soon');
    expect(statusFor(15, 'days')).toBe('ok');
  });
  it('words what is left', () => {
    expect(remainingLabel({ remaining: 1240, basis: 'miles' })).toBe('1,240 mi left');
    expect(remainingLabel({ remaining: -800, basis: 'miles' })).toBe('Overdue by 800 mi');
    expect(remainingLabel({ remaining: 1, basis: 'days' })).toBe('1 day left');
  });
});

describe('building the plan', () => {
  it('turns manufacturer services, tires and the 120-day inspection into items', () => {
    const items = buildPlanner(
      [
        truck({
          manufacturer_services: [{ profile: { id: 'p', manufacturer: 'freightliner', service_name: 'M1 Service', service_code: 'M1', interval_miles: 25000, interval_days: null, description: null, display_order: 1 }, schedule: null, miles_since_service: 24500, baseline: { workOrderId: null, date: null } }],
          miles_since_tire_replacement: 81000,
          schedules: [
            { id: 's1', truck_id: 't1', service_name: 'Tire Replacement', interval_miles: 80000, interval_days: null, last_performed_date: null, last_performed_miles: 0 },
            { id: 's2', truck_id: 't1', service_name: '120-Day Inspection', interval_miles: null, interval_days: 120, last_performed_date: '2026-06-20', last_performed_miles: 0 },
          ],
        }),
      ],
      today,
    );
    expect(items.map((i) => [i.name, i.status])).toEqual([['M1 Service', 'soon'], ['Tire replacement', 'overdue'], ['120-day inspection', 'soon']]);
    expect(items[0]).toMatchObject({ kind: 'M1', remaining: 500 });
    expect(items[2].remaining).toBe(120 - 114); // June 20 to Oct 12 is 114 days
  });

  it('uses the plain oil change schedule only when there is no manufacturer plan', () => {
    const oil = { id: 's', truck_id: 't1', service_name: 'Oil Change', interval_miles: 15000, interval_days: null, last_performed_date: null, last_performed_miles: 0 };
    expect(buildPlanner([truck({ schedules: [oil], miles_since_oil_change: 16000 })], today).map((i) => i.name)).toEqual(['Oil change']);
  });

  it('treats a never-inspected truck as overdue', () => {
    const insp = { id: 's', truck_id: 't1', service_name: '120-Day Inspection', interval_miles: null, interval_days: 120, last_performed_date: null, last_performed_miles: null };
    expect(buildPlanner([truck({ schedules: [insp] })], today)[0].status).toBe('overdue');
  });

  it('puts the most overdue first and counts each status', () => {
    const items = [
      { truckId: 'a', unit: '2', make: '', name: 'x', kind: 'pm', basis: 'miles' as const, used: 0, interval: 0, remaining: 5000, status: 'ok' as const },
      { truckId: 'b', unit: '3', make: '', name: 'y', kind: 'pm', basis: 'miles' as const, used: 0, interval: 0, remaining: -2000, status: 'overdue' as const },
      { truckId: 'c', unit: '1', make: '', name: 'z', kind: 'pm', basis: 'miles' as const, used: 0, interval: 0, remaining: 300, status: 'soon' as const },
    ];
    expect(sortPlan(items).map((i) => i.unit)).toEqual(['3', '1', '2']);
    expect(planCounts(items)).toEqual({ overdue: 1, soon: 1, ok: 1 });
  });
});

describe('kinds and forecast', () => {
  it('maps a service to the kind of job', () => {
    expect(kindFor('pm_a', 'PM A')).toBe('PM_A');
    expect(kindFor(null, 'Tire Replacement')).toBe('tire');
    expect(kindFor(undefined, '120-day inspection')).toBe('inspection');
    expect(kindFor(null, 'Something else')).toBe('pm');
  });
  it('projects a due date from how far the truck runs a day', () => {
    expect(projectedDate({ remaining: 2000, basis: 'miles' }, 400, today)).toEqual(new Date(2026, 9, 17));
    expect(projectedDate({ remaining: 2000, basis: 'miles' }, 0, today)).toBeNull();
    expect(projectedDate({ remaining: 6, basis: 'days' }, 0, today)).toEqual(new Date(2026, 9, 18));
    expect(projectedDate({ remaining: -50, basis: 'miles' }, 100, today)).toEqual(today);
  });
});

describe('maker services by engine, duty and time', () => {
  const svc = (code: string, miles: number | null, days: number | null, since: number, date: string | null = null, make = 'Volvo') =>
    ({ profile: { id: code, manufacturer: make, service_name: code, service_code: code, interval_miles: miles, interval_days: days, description: null, display_order: 1 }, schedule: null, miles_since_service: since, baseline: { workOrderId: null, date } });

  it('knows which service is the oil service for each make', () => {
    expect(isOilService('Freightliner', 'PM_A')).toBe(true);
    expect(isOilService('Kenworth', 'PM_B')).toBe(true);
    expect(isOilService('International', 'CLASS_B')).toBe(true);
    expect(isOilService('Volvo', 'PM_C')).toBe(false);
  });

  it('shortens the oil interval for hard work and follows Cummins for a Cummins engine', () => {
    expect(oilInterval(60000, null, 'normal')).toBe(60000);
    expect(oilInterval(60000, null, 'heavy')).toBe(45000);
    expect(oilInterval(60000, null, 'severe')).toBe(36000);
    expect(oilInterval(75000, 'Cummins', 'normal')).toBe(60000);
    expect(oilInterval(75000, 'Detroit', 'normal')).toBe(75000);
  });

  it('applies the duty cycle to the oil service only', () => {
    const items = buildPlanner([truck({ make: 'Volvo', duty_cycle: 'heavy', manufacturer_services: [svc('PM_B', 60000, null, 40000), svc('PM_C', 150000, null, 40000)] })], today);
    expect(items.map((i) => [i.name, i.interval])).toEqual([['PM_B', 45000], ['PM_C', 150000]]);
  });

  it('uses whichever of miles or months is closer to its limit, and months only once there is a record', () => {
    const dated = buildPlanner([truck({ manufacturer_services: [svc('AIR_DRYER', 300000, 1095, 20000, '2023-10-01')] })], today);
    expect(dated[0]).toMatchObject({ basis: 'days', kind: 'AIR_DRYER', status: 'overdue' });
    const undated = buildPlanner([truck({ manufacturer_services: [svc('AIR_DRYER', 300000, 1095, 20000)] })], today);
    expect(undated[0]).toMatchObject({ basis: 'miles', remaining: 280000 });
  });

  it('shows a months-only service such as the annual DOT inspection as overdue until it has a record', () => {
    expect(buildPlanner([truck({ manufacturer_services: [svc('ANNUAL_DOT', null, 365, 0)] })], today)[0]).toMatchObject({ basis: 'days', status: 'overdue' });
    expect(buildPlanner([truck({ manufacturer_services: [svc('ANNUAL_DOT', null, 365, 0, '2026-08-01')] })], today)[0]).toMatchObject({ status: 'ok', remaining: 365 - 72 });
  });

  it('gives each maker service its own kind of job', () => {
    expect(kindFor('PM_B', 'PM B')).toBe('PM_B');
    expect(kindFor('DPF_CLEAN', 'DPF ash cleaning')).toBe('DPF_CLEAN');
  });
});
