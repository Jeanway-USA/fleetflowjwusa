import { useEffect, useState } from 'react';
import { AlertTriangle, CircleDot, Clock3, Flame, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysDown, formatClock, PRIORITY_LABEL, type Lane, type Priority, type ShopJob } from '@/lib/shop/board';

/** Re-renders every `ms` so clocks tick. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** The colour each lane wears, as a soft tint. Kept in one place so every screen agrees. */
export const LANE_STYLE: Record<Lane, { tint: string; dot: string; text: string }> = {
  queue: { tint: 'bg-slate-500/10', dot: 'bg-slate-400', text: 'text-slate-300' },
  working: { tint: 'bg-primary/10', dot: 'bg-primary', text: 'text-primary' },
  waiting: { tint: 'bg-orange-500/10', dot: 'bg-orange-500', text: 'text-orange-400' },
  ready: { tint: 'bg-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-400' },
};

export function PriorityTag({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === 'normal') return null;
  const style =
    priority === 'critical' ? 'bg-red-500/15 text-red-400 ring-red-500/40' : priority === 'high' ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40' : 'bg-slate-500/15 text-slate-300 ring-slate-500/30';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1', style, className)}>
      {priority === 'critical' ? <Flame className="h-3 w-3" /> : priority === 'high' ? <AlertTriangle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function Initials({ name, className }: { name: string | null; className?: string }) {
  const letters = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/30', !letters && 'bg-muted text-muted-foreground ring-border', className)} title={name ?? 'Unassigned'}>
      {letters || '·'}
    </span>
  );
}

export function TaskBar({ done, total, className }: { done: number; total: number; className?: string }) {
  if (total === 0) return <span className={cn('text-xs text-muted-foreground', className)}>No tasks yet</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', done === total ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{done}/{total}</span>
    </div>
  );
}

export function DownChip({ job, className }: { job: ShopJob; className?: string }) {
  const d = daysDown(job);
  const hot = d >= 5;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', hot ? 'font-semibold text-red-400' : 'text-muted-foreground', className)} title="Days this truck has been in the shop">
      <Clock3 className="h-3 w-3" />
      {d === 0 ? 'In today' : `${d}d down`}
    </span>
  );
}

/** A clock that counts up from `since`. */
export function RunningClock({ since, className }: { since: string; className?: string }) {
  const now = useNow(1000);
  return <span className={cn('tabular-nums', className)}>{formatClock((now.getTime() - new Date(since).getTime()) / 1000)}</span>;
}

export function ShopEmpty({ icon: Icon = Wrench, title, children }: { icon?: typeof Wrench; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
      <Icon className="mb-2 h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}
