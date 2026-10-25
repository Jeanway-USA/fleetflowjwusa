import { Link } from 'react-router-dom';
import { AlertCircle, Package, Timer, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jobTitle, laneOf, type ShopJob } from '@/lib/shop/board';
import { DownChip, Initials, LANE_STYLE, PriorityTag, RunningClock, TaskBar } from '@/components/shop/shared';

/** One truck in the shop. The unit number leads because that is how the shop talks about it. */
export function JobCard({ job, to, large }: { job: ShopJob; to: string; large?: boolean }) {
  const lane = laneOf(job);
  const style = LANE_STYLE[lane];
  return (
    <Link
      to={to}
      className={cn(
        'group block rounded-lg border bg-card p-3.5 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        large && 'p-5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('font-condensed font-bold leading-none tracking-tight', large ? 'text-5xl' : 'text-[28px]')}>{job.unit}</p>
          {job.truckName && <p className={cn('mt-1 truncate text-muted-foreground', large ? 'text-base' : 'text-xs')}>{job.truckName}</p>}
        </div>
        <PriorityTag priority={job.priority} />
      </div>

      <p className={cn('mt-2.5 font-medium leading-snug', large ? 'text-xl' : 'text-sm')}>{jobTitle(job)}</p>
      {job.description && <p className={cn('mt-0.5 line-clamp-2 text-muted-foreground', large ? 'text-base' : 'text-xs')}>{job.description}</p>}

      {job.blockedReason && lane === 'waiting' && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {job.blockedReason}
        </p>
      )}

      <TaskBar done={job.tasksDone} total={job.tasksTotal} className="mt-3" />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
          {job.assignedName ? <Initials name={job.assignedName} className="h-6 w-6 text-xs" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
          <span className={cn('truncate', !job.assignedName && 'text-muted-foreground')}>{job.assignedName ?? 'Unassigned'}</span>
        </span>
        {job.runningTimer && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            <Timer className="h-3 w-3" />
            <RunningClock since={job.runningTimer.startedAt} />
          </span>
        )}
        {job.bay && <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Bay {job.bay}</span>}
        {job.partsCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Package className="h-3 w-3" />
            {job.partsCount}
          </span>
        )}
        <DownChip job={job} className="ml-auto" />
      </div>
    </Link>
  );
}
