import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small stand-in for the database that remembers what was written, so the rules can be checked without one.
const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: any }>,
  updates: [] as Array<{ table: string; patch: any; id?: string }>,
  schedules: {} as Record<string, { id: string; last_performed_date: string | null }>,
  truckInspection: null as string | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any;
    let filters: Record<string, any> = {};
    const api: any = {
      select: () => api,
      insert: (row: any) => { mode = 'insert'; payload = row; state.inserts.push({ table, row }); return api; },
      update: (patch: any) => { mode = 'update'; payload = patch; return api; },
      eq: (k: string, v: any) => { filters[k] = v; return api; },
      is: () => api, not: () => api, or: () => api,
      single: async () => ({ data: { id: 'job-1' }, error: null }),
      maybeSingle: async () => {
        if (table === 'service_schedules') return { data: state.schedules[filters.service_name] ?? null, error: null };
        if (table === 'trucks') return { data: { last_120_inspection_date: state.truckInspection }, error: null };
        return { data: null, error: null };
      },
      then: (resolve: any) => {
        if (mode === 'update') state.updates.push({ table, patch: payload, id: filters.id });
        resolve({ data: [], error: null });
      },
    };
    return api;
  };
  return { supabase: { from: builder } };
});

import { advanceSchedules, logCompletedWork, schedulesFor, shouldAdvance, validateLog } from '@/lib/shop/log-work';

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.schedules = {};
  state.truckInspection = null;
});

describe('which services a job resets', () => {
  it('maps kinds of work to their schedules and ignores plain repairs', () => {
    expect(schedulesFor(['pm', 'tire'])).toEqual(['Oil Change', 'Tire Replacement']);
    expect(schedulesFor(['M1', 'M1'])).toEqual(['M1 Service (Safety & Grease)']);
    expect(schedulesFor(['repair', 'brake'])).toEqual([]);
  });
});

describe('moving a schedule forward', () => {
  it('only advances to a later date, never back', () => {
    expect(shouldAdvance(null, '2026-05-01')).toBe(true);
    expect(shouldAdvance('2026-04-01', '2026-05-01')).toBe(true);
    expect(shouldAdvance('2026-09-01', '2026-05-01')).toBe(false);
    expect(shouldAdvance('2026-05-01', '2026-05-01')).toBe(false);
  });

  it('leaves a newer service alone when older work is logged', async () => {
    state.schedules['Oil Change'] = { id: 's1', last_performed_date: '2026-09-15' };
    await advanceSchedules('t1', ['pm'], '2026-05-01', 300000);
    expect(state.updates).toEqual([]);
  });

  it('resets the service when the logged work is the latest, with the odometer', async () => {
    state.schedules['Oil Change'] = { id: 's1', last_performed_date: '2026-04-01' };
    await advanceSchedules('t1', ['pm'], '2026-10-01', 412000);
    expect(state.updates).toEqual([{ table: 'service_schedules', patch: { last_performed_date: '2026-10-01', last_performed_miles: 412000 }, id: 's1' }]);
  });

  it('sets the next inspection 120 days out', async () => {
    state.schedules['120-Day Inspection'] = { id: 's2', last_performed_date: null };
    await advanceSchedules('t1', ['inspection'], '2026-10-01', null);
    const truck = state.updates.find((u) => u.table === 'trucks');
    expect(truck?.patch).toMatchObject({ last_120_inspection_date: '2026-10-01', next_inspection_date: '2027-01-29' });
  });
});

describe('checking what was entered', () => {
  const ok = { truckId: 't', date: '2026-10-01', kinds: ['pm'], description: '', cost: 0, odometer: null };
  it('accepts a sensible entry', () => expect(validateLog(ok, '2026-10-12')).toBeNull());
  it('needs a truck, a date and something done', () => {
    expect(validateLog({ ...ok, truckId: '' }, '2026-10-12')).toMatch(/truck/);
    expect(validateLog({ ...ok, date: '' }, '2026-10-12')).toMatch(/date/);
    expect(validateLog({ ...ok, kinds: [] }, '2026-10-12')).toMatch(/what was done/);
    expect(validateLog({ ...ok, kinds: [], description: 'Replaced a mirror' }, '2026-10-12')).toBeNull();
  });
  it('refuses a future date and a negative cost', () => {
    expect(validateLog({ ...ok, date: '2026-10-20' }, '2026-10-12')).toMatch(/future/);
    expect(validateLog({ ...ok, cost: -5 }, '2026-10-12')).toMatch(/negative/);
  });
});

describe('logging finished work', () => {
  it('saves a completed job on the date given, and resets only what it covers', async () => {
    state.schedules['Oil Change'] = { id: 's1', last_performed_date: '2026-01-01' };
    const id = await logCompletedWork({ orgId: 'o', userName: 'Andrew', truckId: 't1', date: '2026-09-20', kinds: ['pm'], title: 'Oil change', description: 'Changed oil and filters', doneBy: 'Me', cost: 215.5, odometer: 398000, receipts: [] });
    expect(id).toBe('job-1');
    const job = state.inserts.find((i) => i.table === 'work_orders')!.row;
    expect(job).toMatchObject({ truck_id: 't1', status: 'completed', entry_date: '2026-09-20', estimated_completion: '2026-09-20', final_cost: 215.5, vendor: 'Me', odometer_reading: 398000, service_types: ['pm'], days_down: 0 });
    expect(new Date(job.completed_at).getHours()).toBe(12);
    expect(state.updates.find((u) => u.table === 'service_schedules')?.patch).toMatchObject({ last_performed_date: '2026-09-20' });
  });

  it('refuses before saving anything when the entry is not valid', async () => {
    await expect(logCompletedWork({ orgId: 'o', userName: 'A', truckId: '', date: '2026-09-20', kinds: ['pm'], title: '', description: '', doneBy: '', cost: 0, odometer: null, receipts: [] })).rejects.toThrow(/truck/);
    expect(state.inserts).toEqual([]);
  });
});
