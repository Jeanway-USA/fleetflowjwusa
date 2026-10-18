import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { uploadFile } from '@/hooks/useStorageProvider';
import { useCompleteWorkOrder } from '@/hooks/useMaintenanceData';
import { effectivePriority, type Priority, type ShopJob } from '@/lib/shop/board';
import { todayLocal } from '@/lib/datetime';

// The shop tables are newer than the generated database types.
const db = supabase as any;

const ACTIVE = ['open', 'parts_ordered', 'in_progress'];
const KEY = ['shop'] as const;

/** A query that may fail because the shop upgrade has not been applied yet: it says so instead of throwing. */
async function tolerant<T>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ rows: T[]; ok: boolean }> {
  const { data, error } = await run();
  return error ? { rows: [], ok: false } : { rows: data ?? [], ok: true };
}

export interface ShopTask { id: string; work_order_id: string; label: string; is_done: boolean; done_at: string | null; done_by_name: string | null; sort_order: number; hidden_at: string | null }
export interface ShopPart { id: string; work_order_id: string; part_id: string | null; part_name: string; part_number: string | null; quantity: number; unit_cost: number; logged_by_name: string | null; logged_at: string; voided_at: string | null }
export interface ShopTime { id: string; work_order_id: string; user_id: string; user_name: string | null; started_at: string; ended_at: string | null; archived_at?: string | null }
export interface ShopEvent { id: string; work_order_id: string; kind: string; body: string | null; photo_path: string | null; user_name: string | null; created_at: string }

function buildJobs(workOrders: any[], tasks: ShopTask[], parts: ShopPart[], times: ShopTime[]): ShopJob[] {
  return workOrders.map((wo) => {
    const myTasks = tasks.filter((t) => t.work_order_id === wo.id && !t.hidden_at);
    const myParts = parts.filter((p) => p.work_order_id === wo.id && !p.voided_at);
    const myTime = times.filter((t) => t.work_order_id === wo.id && !t.archived_at);
    const running = myTime.find((t) => !t.ended_at) ?? null;
    const serviceTypes: string[] = wo.service_types && wo.service_types.length > 0 ? wo.service_types : wo.service_type ? [wo.service_type] : [];
    const truck = wo.trucks ?? {};
    return {
      id: wo.id,
      truckId: wo.truck_id,
      unit: truck.unit_number ?? '—',
      truckName: [truck.make, truck.model].filter(Boolean).join(' '),
      odometer: wo.odometer_reading ?? truck.current_odometer ?? null,
      status: wo.status,
      serviceType: wo.service_type ?? '',
      serviceTypes,
      description: wo.description ?? null,
      entryDate: wo.entry_date,
      estimatedCompletion: wo.estimated_completion ?? null,
      startedAt: wo.started_at ?? null,
      assignedTo: wo.assigned_to ?? null,
      assignedName: wo.assigned_name ?? null,
      priority: effectivePriority(wo.priority, serviceTypes),
      bay: wo.bay ?? null,
      blockedReason: wo.blocked_reason ?? null,
      costEstimate: Number(wo.cost_estimate) || 0,
      tasksTotal: myTasks.length,
      tasksDone: myTasks.filter((t) => t.is_done).length,
      partsCount: myParts.length,
      partsCost: myParts.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_cost), 0),
      laborMinutes: myTime.reduce((s, t) => s + Math.max(0, Math.round(((t.ended_at ? new Date(t.ended_at) : new Date()).getTime() - new Date(t.started_at).getTime()) / 60000)), 0),
      runningTimer: running ? { userName: running.user_name, startedAt: running.started_at } : null,
    } satisfies ShopJob;
  });
}

/** Every open job with its tasks, parts and clocks, plus how many were finished today. Refreshes itself. */
export function useShopBoard() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...KEY, 'board'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: workOrders, error } = await db
        .from('work_orders')
        .select('*, trucks (unit_number, make, model, current_odometer)')
        .in('status', ACTIVE)
        .is('deleted_at', null)
        .order('entry_date', { ascending: true });
      if (error) throw error;
      const ids = (workOrders ?? []).map((w: any) => w.id);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const done = await db.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', 'completed').is('deleted_at', null).gte('completed_at', startOfToday.toISOString());

      const [tasks, parts, times] = ids.length === 0
        ? [{ rows: [] as ShopTask[], ok: true }, { rows: [] as ShopPart[], ok: true }, { rows: [] as ShopTime[], ok: true }]
        : await Promise.all([
            tolerant<ShopTask>(() => db.from('work_order_tasks').select('id, work_order_id, is_done, hidden_at, label, done_at, done_by_name, sort_order').in('work_order_id', ids)),
            tolerant<ShopPart>(() => db.from('work_order_parts').select('*').in('work_order_id', ids)),
            tolerant<ShopTime>(() => db.from('work_order_time_entries').select('*').in('work_order_id', ids)),
          ]);

      // With no open jobs there is nothing to probe, so check the tables directly.
      let upgraded = tasks.ok && parts.ok && times.ok;
      if (ids.length === 0) upgraded = (await tolerant(() => db.from('work_order_tasks').select('id').limit(1))).ok;

      return { jobs: buildJobs(workOrders ?? [], tasks.rows, parts.rows, times.rows), doneToday: done.count ?? 0, upgraded };
    },
  });

  // New activity from anyone appears without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('shop-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => qc.invalidateQueries({ queryKey: KEY }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_inventory' }, () => qc.invalidateQueries({ queryKey: KEY }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export interface ShopJobDetail {
  job: ShopJob;
  raw: any;
  tasks: ShopTask[];
  parts: ShopPart[];
  time: ShopTime[];
  events: ShopEvent[];
}

export function useShopJob(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'job', id],
    enabled: !!id,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ShopJobDetail | null> => {
      const { data: wo, error } = await db.from('work_orders').select('*, trucks (unit_number, make, model, current_odometer, vin, status)').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!wo) return null;
      const [tasks, parts, time, events] = await Promise.all([
        tolerant<ShopTask>(() => db.from('work_order_tasks').select('*').eq('work_order_id', id).order('sort_order').order('created_at')),
        tolerant<ShopPart>(() => db.from('work_order_parts').select('*').eq('work_order_id', id).order('logged_at', { ascending: false })),
        tolerant<ShopTime>(() => db.from('work_order_time_entries').select('*').eq('work_order_id', id).order('started_at', { ascending: false })),
        tolerant<ShopEvent>(() => db.from('work_order_events').select('*').eq('work_order_id', id).order('created_at', { ascending: false }).limit(100)),
      ]);
      return { job: buildJobs([wo], tasks.rows, parts.rows, time.rows)[0], raw: wo, tasks: tasks.rows, parts: parts.rows, time: time.rows.filter((t) => !t.archived_at), events: events.rows };
    },
  });
}

/** The signed-in person's display name, used to sign what they do. */
export function useMyName(): string {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: [...KEY, 'my-name', user?.id],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data: p } = await supabase.from('profiles').select('first_name, last_name').eq('user_id', user!.id).maybeSingle();
      return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
    },
  });
  return data || user?.email?.split('@')[0] || 'Mechanic';
}

/** Everyone who can be given a job: owners and the maintenance role in this organization. */
export function useShopCrew() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'crew', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('org_id', orgId!).in('role', ['maintenance', 'owner']);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as Array<{ id: string; name: string }>;
      const { data: profiles } = await supabase.from('profiles').select('user_id, first_name, last_name, email').in('user_id', ids);
      return (profiles ?? []).map((p) => ({ id: p.user_id as string, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email as string) }));
    },
  });
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/** All the things a person can do to a job. Each one refreshes the board and the open job. */
export function useShopActions() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const me = useMyName();
  const complete = useCompleteWorkOrder();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const simple = <A,>(fn: (a: A) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  const event = async (workOrderId: string, kind: string, body: string, photoPath?: string) => {
    if (!orgId) return;
    const { error } = await db.from('work_order_events').insert({ org_id: orgId, work_order_id: workOrderId, kind, body, photo_path: photoPath ?? null, user_name: me, user_id: (await supabase.auth.getUser()).data.user?.id ?? null });
    fail(error);
  };

  return {
    me,
    startJob: simple(async (a: { id: string }) => {
      const { error } = await db.rpc('shop_start_timer', { _work_order_id: a.id, _user_name: me });
      if (error && /function|schema cache|does not exist/i.test(error.message)) {
        // The shop upgrade is not applied yet: start the job without a clock.
        const { error: plain } = await db.from('work_orders').update({ status: 'in_progress' }).eq('id', a.id);
        fail(plain);
        return;
      }
      fail(error);
    }),
    pauseJob: simple(async () => {
      const { error } = await db.rpc('shop_stop_timer', { _user_name: me });
      fail(error);
    }),
    /** Take a job: it becomes yours. */
    assign: simple(async (a: { id: string; userId: string | null; name: string | null }) => {
      const { error } = await db.from('work_orders').update({ assigned_to: a.userId, assigned_name: a.name }).eq('id', a.id);
      fail(error);
      await event(a.id, 'assign', a.name ? `Assigned to ${a.name}` : 'Unassigned');
    }),
    setPriority: simple(async (a: { id: string; priority: Priority }) => {
      const { error } = await db.from('work_orders').update({ priority: a.priority }).eq('id', a.id);
      fail(error);
    }),
    setBay: simple(async (a: { id: string; bay: string | null }) => {
      const { error } = await db.from('work_orders').update({ bay: a.bay }).eq('id', a.id);
      fail(error);
    }),
    /** Stop the job and say why (usually: waiting on a part). */
    block: simple(async (a: { id: string; reason: string }) => {
      await db.rpc('shop_stop_timer', { _user_name: me });
      const { error } = await db.from('work_orders').update({ status: 'parts_ordered', blocked_reason: a.reason }).eq('id', a.id);
      fail(error);
      await event(a.id, 'blocked', a.reason);
    }),
    unblock: simple(async (a: { id: string }) => {
      const { error } = await db.from('work_orders').update({ status: 'in_progress', blocked_reason: null }).eq('id', a.id);
      fail(error);
      await event(a.id, 'status', 'Back to work');
    }),
    addTask: simple(async (a: { id: string; label: string; sortOrder: number }) => {
      const { error } = await db.from('work_order_tasks').insert({ org_id: orgId, work_order_id: a.id, label: a.label, sort_order: a.sortOrder });
      fail(error);
    }),
    addTasks: simple(async (a: { id: string; labels: string[]; startAt: number }) => {
      if (a.labels.length === 0) return;
      const { error } = await db.from('work_order_tasks').insert(a.labels.map((label, i) => ({ org_id: orgId, work_order_id: a.id, label, sort_order: a.startAt + i })));
      fail(error);
    }),
    toggleTask: simple(async (a: { workOrderId: string; taskId: string; done: boolean; label: string }) => {
      const { error } = await db.from('work_order_tasks').update({ is_done: a.done, done_at: a.done ? new Date().toISOString() : null, done_by_name: a.done ? me : null }).eq('id', a.taskId);
      fail(error);
      await event(a.workOrderId, 'task', `${a.done ? 'Done' : 'Reopened'}: ${a.label}`);
    }),
    hideTask: simple(async (a: { taskId: string }) => {
      const { error } = await db.from('work_order_tasks').update({ hidden_at: new Date().toISOString() }).eq('id', a.taskId);
      fail(error);
    }),
    note: simple(async (a: { id: string; text: string }) => event(a.id, 'note', a.text)),
    photo: simple(async (a: { id: string; file: File }) => {
      if (!orgId) throw new Error('Your organization has not finished loading.');
      const path = `work-orders/${orgId}/${a.id}/${Date.now()}-${a.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { path: saved, error } = await uploadFile('documents', path, a.file);
      if (error) throw error;
      await event(a.id, 'photo', 'Photo added', saved);
    }),
    logPart: simple(async (a: { id: string; partId: string; quantity: number }) => {
      const { error } = await db.rpc('shop_log_part', { _work_order_id: a.id, _part_id: a.partId, _quantity: a.quantity, _user_name: me });
      fail(error);
      qc.invalidateQueries({ queryKey: ['all-parts-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock-parts'] });
    }),
    voidPart: simple(async (a: { lineId: string }) => {
      const { error } = await db.rpc('shop_void_part', { _id: a.lineId, _user_name: me });
      fail(error);
      qc.invalidateQueries({ queryKey: ['all-parts-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock-parts'] });
    }),
    updateOdometer: simple(async (a: { id: string; miles: number }) => {
      const { error } = await db.from('work_orders').update({ odometer_reading: a.miles }).eq('id', a.id);
      fail(error);
    }),
    /** Close a job out through the same step the rest of the app uses, so PM schedules and costs stay right. */
    finish: useMutation({
      mutationFn: async (a: { id: string; outsideCost: number; partsCost: number; summary: string }) => {
        await db.rpc('shop_stop_timer', { _user_name: me });
        // Closing a job sets the service date the PM schedules count from, so it must be the day the work was done,
        // not a needed-by date that was set when the job was created.
        const { error: dateError } = await db.from('work_orders').update({ estimated_completion: todayLocal() }).eq('id', a.id);
        fail(dateError);
        await complete.mutateAsync({ id: a.id, final_cost: Math.round((a.partsCost + a.outsideCost) * 100) / 100, notes: a.summary || undefined });
        await event(a.id, 'status', 'Finished');
      },
      onSuccess: refresh,
    }),
    createJob: simple(async (a: { truckId: string; serviceTypes: string[]; description: string; priority: Priority; tasks: string[]; assignedTo?: string | null; assignedName?: string | null; estimatedCompletion?: string | null }) => {
      const row: Record<string, unknown> = { truck_id: a.truckId, service_type: a.serviceTypes[0], service_types: a.serviceTypes, description: a.description || null, entry_date: todayLocal(), estimated_completion: a.estimatedCompletion ?? null };
      // These columns arrive with the shop upgrade; leave them out until then so a job can still be made.
      if (a.priority !== 'normal') row.priority = a.priority;
      if (a.assignedTo) Object.assign(row, { assigned_to: a.assignedTo, assigned_name: a.assignedName });
      const { data, error } = await db
        .from('work_orders')
        .insert(row)
        .select('id')
        .single();
      fail(error);
      if (a.tasks.length > 0) {
        const { error: taskError } = await db.from('work_order_tasks').insert(a.tasks.map((label, i) => ({ org_id: orgId, work_order_id: data.id, label, sort_order: i + 1 })));
        fail(taskError);
      }
      qc.invalidateQueries({ queryKey: ['active-work-orders'] });
      qc.invalidateQueries({ queryKey: ['fleet-availability'] });
    }),
  };
}
