import { differenceInCalendarDays, differenceInMinutes, parseISO } from 'date-fns';

/**
 * The shop board's rules, kept apart from the screens so they can be tested. A job sits in exactly one lane:
 *   queue    not started
 *   working  someone has started it
 *   waiting  blocked on parts (or anything else, with a reason)
 *   ready    every task is ticked, so it only needs to be closed out
 */
export type Lane = 'queue' | 'working' | 'waiting' | 'ready';
export type Priority = 'low' | 'normal' | 'high' | 'critical';

export const LANES: Array<{ key: Lane; title: string; hint: string }> = [
  { key: 'queue', title: 'Up next', hint: 'Waiting to be started' },
  { key: 'working', title: 'On the lift', hint: 'Being worked now' },
  { key: 'waiting', title: 'Waiting', hint: 'Blocked on parts or a decision' },
  { key: 'ready', title: 'Ready to close', hint: 'All tasks done' },
];

export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
export const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' };

export interface ShopJob {
  id: string;
  truckId: string;
  unit: string;
  truckName: string;
  odometer: number | null;
  status: string;
  serviceType: string;
  serviceTypes: string[];
  description: string | null;
  entryDate: string;
  estimatedCompletion: string | null;
  startedAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  priority: Priority;
  bay: string | null;
  blockedReason: string | null;
  costEstimate: number;
  tasksTotal: number;
  tasksDone: number;
  partsCount: number;
  partsCost: number;
  laborMinutes: number;
  /** Who is on the clock for this job right now, if anyone. */
  runningTimer: { userName: string | null; startedAt: string } | null;
}

/** Service types that mean the truck cannot safely run, so they float to the top even if nobody set a priority. */
const URGENT_WORK = /(tire|brake|engine|breakdown|tow|steer|air leak|coolant)/i;

/** The priority a job is shown with. A priority someone chose is kept; otherwise urgent kinds of work are raised. */
export function effectivePriority(stored: string | null | undefined, serviceTypes: string[]): Priority {
  const chosen = (['low', 'high', 'critical'] as const).find((p) => p === stored);
  if (chosen) return chosen;
  return serviceTypes.some((s) => URGENT_WORK.test(s)) ? 'high' : 'normal';
}

export function laneOf(job: Pick<ShopJob, 'status' | 'tasksTotal' | 'tasksDone' | 'startedAt'>): Lane {
  if (job.status === 'parts_ordered') return 'waiting';
  if (job.status === 'in_progress') {
    return job.tasksTotal > 0 && job.tasksDone >= job.tasksTotal ? 'ready' : 'working';
  }
  return 'queue';
}

export function daysDown(job: Pick<ShopJob, 'entryDate'>, today: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(today, parseISO(job.entryDate)));
}

/** Most urgent first; among equals, the truck that has been down longest. */
export function sortJobs(jobs: ShopJob[], today: Date = new Date()): ShopJob[] {
  return [...jobs].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || daysDown(b, today) - daysDown(a, today) || a.unit.localeCompare(b.unit, undefined, { numeric: true }),
  );
}

export function groupByLane(jobs: ShopJob[], today: Date = new Date()): Record<Lane, ShopJob[]> {
  const out: Record<Lane, ShopJob[]> = { queue: [], working: [], waiting: [], ready: [] };
  for (const job of sortJobs(jobs, today)) out[laneOf(job)].push(job);
  return out;
}

export interface BoardSummary {
  open: number;
  trucksDown: number;
  perLane: Record<Lane, number>;
  longestDown: { unit: string; days: number } | null;
  partsCost: number;
  laborMinutes: number;
  unassigned: number;
  overdue: number;
}

export function summarize(jobs: ShopJob[], today: Date = new Date()): BoardSummary {
  const perLane: Record<Lane, number> = { queue: 0, working: 0, waiting: 0, ready: 0 };
  let longest: BoardSummary['longestDown'] = null;
  let overdue = 0;
  for (const j of jobs) {
    perLane[laneOf(j)]++;
    const d = daysDown(j, today);
    if (!longest || d > longest.days) longest = { unit: j.unit, days: d };
    if (j.estimatedCompletion && differenceInCalendarDays(today, parseISO(j.estimatedCompletion)) > 0) overdue++;
  }
  return {
    open: jobs.length,
    trucksDown: new Set(jobs.map((j) => j.truckId)).size,
    perLane,
    longestDown: longest,
    partsCost: jobs.reduce((s, j) => s + j.partsCost, 0),
    laborMinutes: jobs.reduce((s, j) => s + j.laborMinutes, 0),
    unassigned: jobs.filter((j) => !j.assignedTo && !j.assignedName).length,
    overdue,
  };
}

/** 95 -> "1h 35m", 40 -> "40m", 0 -> "0m". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h > 0 ? `${h}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

/** A running clock, "1:05:09" or "5:09". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Minutes between two timestamps; a still-running entry counts up to `now`. */
export function entryMinutes(entry: { startedAt: string; endedAt: string | null }, now: Date = new Date()): number {
  const end = entry.endedAt ? new Date(entry.endedAt) : now;
  return Math.max(0, differenceInMinutes(end, new Date(entry.startedAt)));
}

export const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The job title: the service types, or a fallback. */
export function jobTitle(job: Pick<ShopJob, 'serviceType' | 'serviceTypes'>): string {
  const list = job.serviceTypes.length > 0 ? job.serviceTypes : job.serviceType ? [job.serviceType] : [];
  return list.length > 0 ? list.map(prettyService).join(' + ') : 'Repair';
}

const SERVICE_LABELS: Record<string, string> = {
  pm: 'Oil change', PM_A: 'PM A (oil and fuel)', M1: 'M1 service', M2: 'M2 service', M3: 'M3 service',
  tire: 'Tires', inspection: '120-day inspection', repair: 'Repair', brake: 'Brakes',
};

export function prettyService(s: string): string {
  return SERVICE_LABELS[s] ?? SERVICE_LABELS[s.toLowerCase()] ?? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
