import { describe, expect, it } from 'vitest';
import { stepsFromDescription, tasksForKindsIn, workKindsFor, type ProfileRow } from '@/lib/shop/truckWork';

const p = (manufacturer: string, service_code: string, service_name: string, description: string | null, display_order = 1): ProfileRow => ({ manufacturer, service_code, service_name, description, display_order });
const profiles = [
  p('Freightliner', 'M1', 'M1 Service', 'Chassis lube'),
  p('Freightliner', 'PM_A', 'PM A (Oil & Fuel)', 'Engine oil', 2),
  p('Kenworth', 'PM_A', 'PM A (System Check)', 'Air system, Charge air system, Cooling system inspection.'),
  p('Kenworth', 'PM_B', 'PM B (Oil & Filters)', 'Engine oil, Oil filters', 2),
  p('Kenworth', 'TRANS_FLUID', 'Transmission fluid and filter', 'Drain, refill', 3),
];
const keys = (spec: Parameters<typeof workKindsFor>[0]) => workKindsFor(spec, profiles).map((k) => k.key);

describe('work offered for a truck', () => {
  it('offers every kind when no truck is chosen or the make has no list', () => {
    expect(keys(null)).toContain('M1');
    expect(keys({ make: 'Autocar' })).toContain('M1');
  });

  it('offers the maker services for that make only, after the oil change and before the everyday jobs', () => {
    expect(keys({ make: 'Freightliner' })).toEqual(['pm', 'M1', 'PM_A', 'tire', 'brake', 'inspection', 'repair']);
    expect(keys({ make: ' kenworth ' })).toEqual(['pm', 'PM_A', 'PM_B', 'TRANS_FLUID', 'tire', 'brake', 'inspection', 'repair']);
  });

  it('adds valve lash for a Cummins engine only', () => {
    expect(keys({ make: 'Kenworth', engine_make: 'Cummins' })).toContain('VALVE_LASH');
    expect(keys({ make: 'Kenworth', engine_make: 'PACCAR' })).not.toContain('VALVE_LASH');
  });

  it('uses the maker description, not the Freightliner preset, for a PACCAR PM A', () => {
    const kw = workKindsFor({ make: 'Kenworth' }, profiles).find((k) => k.key === 'PM_A')!;
    expect(kw.tasks).toEqual(['Air system', 'Charge air system', 'Cooling system inspection']);
    expect(workKindsFor({ make: 'Freightliner' }, profiles).find((k) => k.key === 'PM_A')!.tasks).toContain('Replace oil filter');
  });

  it('adds the engine oil spec to the oil service and the Endurant fluid to the transmission service', () => {
    const k = workKindsFor({ make: 'Kenworth', engine_make: 'Cummins', transmission: 'Eaton Endurant (automated)' }, profiles);
    expect(k.find((x) => x.key === 'PM_B')!.tasks[0]).toMatch(/Cummins/);
    expect(k.find((x) => x.key === 'TRANS_FLUID')!.tasks.at(-1)).toMatch(/PS-386/);
  });

  it('builds a checklist from the options for a truck', () => {
    const o = workKindsFor({ make: 'Kenworth' }, profiles);
    expect(tasksForKindsIn(o, ['PM_B', 'TRANS_FLUID']).slice(0, 3)).toEqual(['Engine oil', 'Oil filters', 'Drain the transmission fluid']);
  });

  it('splits a description without breaking brackets', () => {
    expect(stepsFromDescription('Chassis lube (kingpins, u-joints), 5th wheel.')).toEqual(['Chassis lube (kingpins, u-joints)', '5th wheel']);
  });
});
