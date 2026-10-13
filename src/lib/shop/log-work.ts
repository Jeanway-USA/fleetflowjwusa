import { addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toLocalIso, todayLocal } from '@/lib/datetime';

const db = supabase as any;

/** The service schedule each kind of work resets, by the schedule's own name. */
const SCHEDULE_FOR_KIND: Record<string, string> = {
  M1: 'M1 Service (Safety & Grease)',
  PM_A: 'PM A (Oil & Fuel)',
  M2: 'M2 Service (Annual)',
  M3: 'M3 Service (Major Fluids)',
  pm: 'Oil Change',
  tire: 'Tire Replacement',
  inspection: '120-Day Inspection',
};

/** Which schedules a set of work kinds resets. Work that is not a scheduled service (a repair) resets none. */
export function schedulesFor(kinds: string[]): string[] {
  const names = kinds.map((k) => SCHEDULE_FOR_KIND[k] ?? SCHEDULE_FOR_KIND[k.toLowerCase()]).filter(Boolean) as string[];
  return Array.from(new Set(names));
}

/**
 * Whether logging work on `workDate` should reset a schedule last done on `lastDone`. A schedule only ever moves
 * forward: logging an older job (say, last spring's oil change) must not make the truck look like it was serviced
 * earlier than it really was.
 */
export function shouldAdvance(lastDone: string | null | undefined, workDate: string): boolean {
  return !lastDone || lastDone < workDate;
}

export interface LogWorkInput {
  orgId: string;
  userName: string;
  truckId: string;
  date: string;
  kinds: string[];
  title: string;
  description: string;
  doneBy: string;
  cost: number;
  odometer: number | null;
  receipts: File[];
}

export function validateLog(i: Pick<LogWorkInput, 'truckId' | 'date' | 'kinds' | 'description' | 'cost' | 'odometer'>, today: string = todayLocal()): string | null {
  if (!i.truckId) return 'Choose the truck.';
  if (!i.date) return 'Choose the date the work was done.';
  if (i.date > today) return 'The date cannot be in the future. Make a job for work that is still to be done.';
  if (i.kinds.length === 0 && !i.description.trim()) return 'Say what was done: pick the work, or describe it.';
  if (!(i.cost >= 0)) return 'The cost cannot be negative.';
  if (i.odometer != null && i.odometer < 0) return 'The odometer cannot be negative.';
  return null;
}

/** Finds a job already logged for the same truck and day with the same kind of work, so nothing is entered twice. */
export async function findDuplicate(truckId: string, date: string, kinds: string[]): Promise<{ id: string; title: string } | null> {
  const { data } = await db
    .from('work_orders')
    .select('id, service_type, service_types, description')
    .eq('truck_id', truckId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .eq('estimated_completion', date);
  const hit = (data ?? []).find((r: any) => {
    const theirs: string[] = r.service_types?.length ? r.service_types : [r.service_type];
    return kinds.length === 0 ? true : theirs.some((k) => kinds.includes(k));
  });
  return hit ? { id: hit.id, title: hit.description || hit.service_type } : null;
}

/** Records finished work as a completed job, resets the service schedules it covers, and files any receipts. */
export async function logCompletedWork(input: LogWorkInput): Promise<string> {
  const problem = validateLog(input);
  if (problem) throw new Error(problem);

  const kinds = input.kinds.length > 0 ? input.kinds : ['repair'];
  // Noon on the day, so the date never slips across midnight in any time zone.
  const completedAt = new Date(`${input.date}T12:00:00`).toISOString();

  const { data: job, error } = await db
    .from('work_orders')
    .insert({
      truck_id: input.truckId,
      service_type: kinds[0],
      service_types: kinds,
      description: input.description.trim() || input.title || null,
      entry_date: input.date,
      estimated_completion: input.date,
      status: 'completed',
      completed_at: completedAt,
      days_down: 0,
      final_cost: input.cost,
      cost_estimate: input.cost,
      vendor: input.doneBy.trim() || null,
      odometer_reading: input.odometer,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const events: Array<Record<string, unknown>> = [{ kind: 'status', body: `Logged as done on ${input.date}`, photo_path: null }];

  for (const file of input.receipts) {
    const { uploadFile } = await import('@/hooks/useStorageProvider');
    const path = `work-orders/${input.orgId}/${job.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { path: saved, error: upError } = await uploadFile('documents', path, file);
    if (upError) throw new Error(`The job was saved, but a receipt could not be uploaded: ${upError.message}`);
    events.push({ kind: 'photo', body: 'Receipt', photo_path: saved });
  }
  // The activity feed arrives with the shop upgrade; if it is missing the job is still saved.
  await db.from('work_order_events').insert(events.map((e) => ({ ...e, org_id: input.orgId, work_order_id: job.id, user_name: input.userName })));

  await advanceSchedules(input.truckId, kinds, input.date, input.odometer);
  return job.id as string;
}

/** Moves each covered schedule forward to the work date, and never backward. */
export async function advanceSchedules(truckId: string, kinds: string[], date: string, odometer: number | null) {
  for (const name of schedulesFor(kinds)) {
    const { data: row } = await db.from('service_schedules').select('id, last_performed_date').eq('truck_id', truckId).eq('service_name', name).maybeSingle();
    if (row && shouldAdvance(row.last_performed_date, date)) {
      const patch: Record<string, unknown> = { last_performed_date: date };
      if (odometer != null) patch.last_performed_miles = odometer;
      await db.from('service_schedules').update(patch).eq('id', row.id);
    }
    if (name === '120-Day Inspection') {
      const { data: truck } = await db.from('trucks').select('last_120_inspection_date').eq('id', truckId).maybeSingle();
      if (truck && shouldAdvance(truck.last_120_inspection_date, date)) {
        const next = toLocalIso(addDays(parseISO(date), 120));
        await db.from('trucks').update({ last_120_inspection_date: date, next_inspection_date: next, ...(odometer != null ? { last_120_inspection_miles: odometer } : {}) }).eq('id', truckId);
      }
    }
  }
}
