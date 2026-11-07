import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small stand-in for the database that remembers what was written, so the rules can be checked without one.
const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: any }>,
  updates: [] as Array<{ table: string; patch: any; id?: string }>,
  schedules: {} as Record<string, { id: string; last_performed_date: string | null }>,
  truckInspection: null as string | null,
  uploadFails: false,
  uploadedPaths: [] as string[],
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

vi.mock('@/hooks/useStorageProvider', () => ({
  uploadFile: async (_bucket: string, path: string) => {
    state.uploadedPaths.push(path);
    return state.uploadFails ? { path: '', error: new Error('new row violates row-level security policy') } : { path, error: null };
  },
}));

import { advanceSchedules, logCompletedWork, schedulesFor, shouldAdvance, validateLog } from '@/lib/shop/log-work';

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.schedules = {};
  state.truckInspection = null;
  state.uploadFails = false;
  state.uploadedPaths = [];
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

describe('logging work from an invoice', () => {
  const base = { orgId: 'o', userName: 'Andrew', truckId: 't1', date: '2026-11-06', kinds: ['repair'], title: 'Repair', description: 'Replaced the air compressor', doneBy: 'Reliable Road Service', cost: 1684.71, odometer: null };
  const invoice = new File(['%PDF'], 'INVOICE_5054.pdf', { type: 'application/pdf' });

  it('keeps the invoice notes and the parts used, and points the job at the invoice file', async () => {
    await logCompletedWork({
      ...base, receipts: [invoice], invoiceIndex: 0, notes: 'Invoice #5054 from Reliable Road Service',
      parts: [{ name: 'Hose (per ft)', number: null, quantity: 4, unitCost: 27 }, { name: 'Air compressor', number: 'AC-1', quantity: 1, unitCost: 1495.69 }],
    });
    expect(state.inserts.find((i) => i.table === 'work_orders')!.row).toMatchObject({ notes: 'Invoice #5054 from Reliable Road Service', final_cost: 1684.71 });
    const parts = state.inserts.find((i) => i.table === 'work_order_parts')!.row;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ org_id: 'o', work_order_id: 'job-1', part_name: 'Hose (per ft)', part_number: null, quantity: 4, unit_cost: 27 });
    expect(parts[1]).toMatchObject({ part_number: 'AC-1', quantity: 1, unit_cost: 1495.69 });
    const link = state.updates.find((u) => u.table === 'work_orders');
    expect(link?.patch.invoice_url).toMatch(/INVOICE_5054.pdf$/);
    const events = state.inserts.find((i) => i.table === 'work_order_events')!.row;
    expect(events.some((e: any) => e.kind === 'photo' && e.body === 'Invoice')).toBe(true);
  });

  it('does not save a parts list, or point at an invoice, when there is none', async () => {
    await logCompletedWork({ ...base, receipts: [] });
    expect(state.inserts.some((i) => i.table === 'work_order_parts')).toBe(false);
    expect(state.updates.some((u) => u.table === 'work_orders')).toBe(false);
    expect(state.inserts.find((i) => i.table === 'work_orders')!.row.notes).toBeNull();
  });

  it('leaves out parts with no quantity or no name', async () => {
    await logCompletedWork({ ...base, receipts: [], parts: [{ name: ' ', number: null, quantity: 1, unitCost: 5 }, { name: 'Bolt', number: null, quantity: 0, unitCost: 1 }] });
    expect(state.inserts.some((i) => i.table === 'work_order_parts')).toBe(false);
  });
});

describe('saving the invoice file', () => {
  const base = { orgId: 'org-9', userName: 'Andrew', truckId: 't1', date: '2026-11-06', kinds: ['repair'], title: 'Repair', description: 'Replaced the air compressor', doneBy: 'Reliable Road Service', cost: 1684.71, odometer: null };
  const invoice = new File(['%PDF'], 'INVOICE 5054.pdf', { type: 'application/pdf' });

  it('puts the file under the organization folder first, which is the only place storage allows', async () => {
    await logCompletedWork({ ...base, receipts: [invoice] });
    expect(state.uploadedPaths).toHaveLength(1);
    expect(state.uploadedPaths[0]).toMatch(/^org-9\/work-orders\/job-1\/\d+-INVOICE_5054\.pdf$/);
  });

  it('still records the parts, the history and the service when the file cannot be saved, and says what was left out', async () => {
    state.uploadFails = true;
    const warnings: string[] = [];
    const id = await logCompletedWork({ ...base, receipts: [invoice], invoiceIndex: 0, parts: [{ name: 'Hose', number: null, quantity: 2, unitCost: 27 }], onWarning: (m) => warnings.push(m) });
    expect(id).toBe('job-1');
    expect(state.inserts.find((i) => i.table === 'work_order_parts')!.row).toHaveLength(1);
    const events = state.inserts.find((i) => i.table === 'work_order_events')!.row;
    expect(events.some((e: any) => e.kind === 'status')).toBe(true);
    expect(events.some((e: any) => e.kind === 'note' && /Not saved with this job: INVOICE 5054.pdf/.test(e.body))).toBe(true);
    expect(events.some((e: any) => e.kind === 'photo')).toBe(false);
    expect(state.updates.some((u) => u.table === 'work_orders')).toBe(false); // no invoice link without a file
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/The job was saved, but INVOICE 5054.pdf could not be saved/);
  });

  it('keeps the files that did save when only one fails', async () => {
    const good = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    let calls = 0;
    const realPush = state.uploadedPaths.push.bind(state.uploadedPaths);
    state.uploadedPaths.push = (...a: string[]) => { calls++; state.uploadFails = calls === 1; return realPush(...a); };
    const warnings: string[] = [];
    await logCompletedWork({ ...base, receipts: [invoice, good], invoiceIndex: 0, onWarning: (m) => warnings.push(m) });
    const events = state.inserts.find((i) => i.table === 'work_order_events')!.row;
    expect(events.filter((e: any) => e.kind === 'photo')).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});
