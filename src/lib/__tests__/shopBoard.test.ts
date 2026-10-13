import { describe, expect, it } from 'vitest';
import { daysDown, effectivePriority, entryMinutes, formatClock, formatMinutes, groupByLane, jobTitle, laneOf, sortJobs, summarize, type ShopJob } from '@/lib/shop/board';

const today = new Date(2026, 9, 12, 14, 0); // Oct 12, 2:00 pm

const job = (over: Partial<ShopJob> = {}): ShopJob => ({
  id: 'j', truckId: 't1', unit: '101', truckName: 'Freightliner Cascadia', odometer: 100000, status: 'open', serviceType: 'pm', serviceTypes: [],
  description: null, entryDate: '2026-10-12', estimatedCompletion: null, startedAt: null, assignedTo: null, assignedName: null, priority: 'normal',
  bay: null, blockedReason: null, costEstimate: 0, tasksTotal: 0, tasksDone: 0, partsCount: 0, partsCost: 0, laborMinutes: 0, runningTimer: null, ...over,
});

describe('which lane a job is in', () => {
  it('puts unstarted work in the queue, started work on the lift, and parts-blocked work in waiting', () => {
    expect(laneOf(job({ status: 'open' }))).toBe('queue');
    expect(laneOf(job({ status: 'in_progress' }))).toBe('working');
    expect(laneOf(job({ status: 'parts_ordered' }))).toBe('waiting');
  });

  it('moves a job to ready to close once every task is ticked, but never with no tasks', () => {
    expect(laneOf(job({ status: 'in_progress', tasksTotal: 3, tasksDone: 2 }))).toBe('working');
    expect(laneOf(job({ status: 'in_progress', tasksTotal: 3, tasksDone: 3 }))).toBe('ready');
    expect(laneOf(job({ status: 'in_progress', tasksTotal: 0, tasksDone: 0 }))).toBe('working');
  });

  it('keeps a parts-blocked job in waiting even when its tasks are done', () => {
    expect(laneOf(job({ status: 'parts_ordered', tasksTotal: 2, tasksDone: 2 }))).toBe('waiting');
  });
});

describe('priority', () => {
  it('keeps a priority someone chose', () => {
    expect(effectivePriority('critical', ['pm'])).toBe('critical');
    expect(effectivePriority('low', ['brake'])).toBe('low');
  });
  it('raises work that keeps a truck off the road when nobody chose', () => {
    expect(effectivePriority('normal', ['tire'])).toBe('high');
    expect(effectivePriority(null, ['Brake repair'])).toBe('high');
    expect(effectivePriority('normal', ['pm'])).toBe('normal');
  });
});

describe('ordering and counts', () => {
  const jobs = [
    job({ id: 'a', unit: '104', priority: 'normal', entryDate: '2026-10-05' }),
    job({ id: 'b', unit: '102', priority: 'critical', entryDate: '2026-10-12' }),
    job({ id: 'c', unit: '103', priority: 'normal', entryDate: '2026-10-01' }),
    job({ id: 'd', unit: '105', priority: 'high', entryDate: '2026-10-12' }),
  ];

  it('puts the most urgent first, then the truck down longest', () => {
    expect(sortJobs(jobs, today).map((j) => j.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('counts days down by calendar day, never below zero', () => {
    expect(daysDown(job({ entryDate: '2026-10-01' }), today)).toBe(11);
    expect(daysDown(job({ entryDate: '2026-10-12' }), today)).toBe(0);
    expect(daysDown(job({ entryDate: '2026-10-20' }), today)).toBe(0);
  });

  it('groups into lanes and summarizes the board', () => {
    const board = [
      job({ id: '1', status: 'open' }),
      job({ id: '2', status: 'in_progress', truckId: 't2', unit: '102', entryDate: '2026-10-06', assignedName: 'Sam', partsCost: 40, laborMinutes: 90 }),
      job({ id: '3', status: 'parts_ordered', truckId: 't2', unit: '102', estimatedCompletion: '2026-10-10' }),
      job({ id: '4', status: 'in_progress', tasksTotal: 1, tasksDone: 1, truckId: 't3', unit: '103' }),
    ];
    const lanes = groupByLane(board, today);
    expect(Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.map((j) => j.id)]))).toEqual({ queue: ['1'], working: ['2'], waiting: ['3'], ready: ['4'] });
    const s = summarize(board, today);
    expect(s).toMatchObject({ open: 4, trucksDown: 3, unassigned: 3, overdue: 1, partsCost: 40, laborMinutes: 90 });
    expect(s.longestDown).toEqual({ unit: '102', days: 6 });
  });
});

describe('time and labels', () => {
  it('formats worked time', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(40)).toBe('40m');
    expect(formatMinutes(95)).toBe('1h 35m');
    expect(formatMinutes(125)).toBe('2h 05m');
  });
  it('formats a running clock', () => {
    expect(formatClock(309)).toBe('5:09');
    expect(formatClock(3909)).toBe('1:05:09');
  });
  it('counts a running entry up to now', () => {
    expect(entryMinutes({ startedAt: new Date(2026, 9, 12, 13, 0).toISOString(), endedAt: null }, today)).toBe(60);
    expect(entryMinutes({ startedAt: new Date(2026, 9, 12, 9, 0).toISOString(), endedAt: new Date(2026, 9, 12, 9, 45).toISOString() }, today)).toBe(45);
  });
  it('names a job from its service types', () => {
    expect(jobTitle(job({ serviceType: 'pm', serviceTypes: [] }))).toBe('Oil change');
    expect(jobTitle(job({ serviceType: 'x', serviceTypes: ['M1', 'tire'] }))).toBe('M1 service + Tires');
    expect(jobTitle(job({ serviceType: '', serviceTypes: [] }))).toBe('Repair');
  });
});
