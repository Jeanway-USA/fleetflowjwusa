import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName } from '@/hooks/useShop';
import type { JobTimerEntry, ShiftEntry } from '@/lib/shop/hours';

// The shift tables are newer than the generated database types.
const db = supabase as any;
const KEY = ['shift'] as const;

export interface MyShift extends ShiftEntry {
  mealStartedAt: string | null;
}

const toShift = (r: any): MyShift => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  mealMinutes: Number(r.meal_minutes) || 0,
  mealStartedAt: r.meal_started_at ?? null,
  needsReview: !!r.needs_review,
});

/**
 * The signed-in person's open shift, if any. `ready` is false until the shift upgrade is applied: the clock is
 * then hidden rather than broken. Stale clocks (left running past 12 hours) are closed each time this loads.
 */
export function useMyShift() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: [...KEY, 'mine', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ ready: boolean; shift: MyShift | null }> => {
      await db.rpc('shop_close_stale_clocks');
      const { data, error } = await db.from('shift_entries').select('*').eq('user_id', user!.id).is('ended_at', null).is('archived_at', null).maybeSingle();
      if (error) return { ready: false, shift: null };
      return { ready: true, shift: data ? toShift(data) : null };
    },
  });
  return { ready: q.data?.ready ?? false, shift: q.data?.shift ?? null, isLoading: q.isLoading };
}

/** Clock in, take a meal break, clock out. */
export function useShiftActions() {
  const qc = useQueryClient();
  const me = useMyName();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['shop'] });
  };
  const call = (fn: string, args?: Record<string, unknown>) => async () => {
    const { error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
  };
  return {
    clockIn: useMutation({ mutationFn: call('shift_clock_in', { _user_name: me }), onSuccess: refresh }),
    clockOut: useMutation({ mutationFn: call('shift_clock_out'), onSuccess: refresh }),
    mealStart: useMutation({ mutationFn: call('shift_meal_start'), onSuccess: refresh }),
    mealEnd: useMutation({ mutationFn: call('shift_meal_end'), onSuccess: refresh }),
  };
}

export interface HoursData {
  ready: boolean;
  shifts: Array<ShiftEntry & { mealStartedAt: string | null; autoStopped: boolean; archivedAt: string | null }>;
  timers: Array<JobTimerEntry & { id: string; userName: string | null }>;
  jobs: Map<string, string>;
}

/** Everyone's shifts and job timers that touch a pay week, with the jobs' names. The owner sees all; others see their own. */
export function useHoursData(weekStart: Date) {
  const { user } = useAuth();
  const from = weekStart.toISOString();
  // A shift that began the night before can run into the week, so look back a day.
  const lookBack = addDays(weekStart, -1).toISOString();
  const to = addDays(weekStart, 7).toISOString();
  return useQuery({
    queryKey: [...KEY, 'hours', user?.id, from],
    enabled: !!user?.id,
    queryFn: async (): Promise<HoursData> => {
      await db.rpc('shop_close_stale_clocks');
      const { data: shiftRows, error } = await db.from('shift_entries').select('*').gte('started_at', lookBack).lt('started_at', to).order('started_at', { ascending: true });
      if (error) return { ready: false, shifts: [], timers: [], jobs: new Map() };
      const { data: timerRows } = await db.from('work_order_time_entries').select('*').gte('started_at', lookBack).lt('started_at', to).order('started_at', { ascending: true });
      const timers = ((timerRows ?? []) as any[]).filter((t) => !t.archived_at);
      const ids = Array.from(new Set(timers.map((t) => t.work_order_id as string)));
      const jobs = new Map<string, string>();
      if (ids.length > 0) {
        const { data: wos } = await db.from('work_orders').select('id, description, service_type, trucks (unit_number)').in('id', ids);
        for (const w of (wos ?? []) as any[]) jobs.set(w.id, `${w.trucks?.unit_number ? `Truck ${w.trucks.unit_number} · ` : ''}${w.description || w.service_type || 'Job'}`.slice(0, 80));
      }
      return {
        ready: true,
        shifts: ((shiftRows ?? []) as any[]).map((r) => ({ ...toShift(r), autoStopped: !!r.auto_stopped, archivedAt: r.archived_at ?? null })),
        timers: timers.map((t) => ({ id: t.id, userId: t.user_id, userName: t.user_name, workOrderId: t.work_order_id, startedAt: t.started_at, endedAt: t.ended_at, needsReview: !!t.needs_review })),
        jobs,
      };
    },
  });
}

/** Owner corrections: change an entry's times (with a reason), accept it as it is, archive it, or restore it. */
export function useTimeReview() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    edit: useMutation({
      mutationFn: async (a: { kind: 'shift' | 'job_timer'; id: string; started: string; ended: string; mealMinutes: number | null; reason: string }) => {
        const { error } = await db.rpc('shop_edit_time', { _kind: a.kind, _id: a.id, _started: a.started, _ended: a.ended, _meal_minutes: a.mealMinutes, _reason: a.reason });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    review: useMutation({
      mutationFn: async (a: { kind: 'shift' | 'job_timer'; id: string; action: 'accept' | 'archive' | 'restore'; reason?: string }) => {
        const { error } = await db.rpc('shop_review_time', { _kind: a.kind, _id: a.id, _action: a.action, _reason: a.reason ?? null });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
  };
}
