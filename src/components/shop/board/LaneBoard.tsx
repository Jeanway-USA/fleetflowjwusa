import { cn } from '@/lib/utils';
import { LANES, groupByLane, type ShopJob } from '@/lib/shop/board';
import { LANE_STYLE, ShopEmpty } from '@/components/shop/shared';
import { JobCard } from '@/components/shop/board/JobCard';

const EMPTY: Record<string, string> = {
  queue: 'Nothing waiting. New jobs show up here.',
  working: 'Nobody is on a truck right now.',
  waiting: 'Nothing is blocked.',
  ready: 'Finished jobs wait here until they are closed out.',
};

/** The four lanes a truck moves through, left to right. */
export function LaneBoard({ jobs, jobPath, wall }: { jobs: ShopJob[]; jobPath: (id: string) => string; wall?: boolean }) {
  const lanes = groupByLane(jobs);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {LANES.map((lane) => {
        const items = lanes[lane.key];
        const style = LANE_STYLE[lane.key];
        return (
          <section key={lane.key} aria-label={lane.title} className={cn('flex min-h-[200px] flex-col rounded-2xl border bg-muted/30 p-2.5', wall && 'min-h-[60vh]')}>
            <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
              <span className={cn('h-2.5 w-2.5 rounded-full', style.dot)} />
              <h2 className={cn('font-condensed text-xl font-bold leading-none', wall && 'text-3xl')}>{lane.title}</h2>
              <span className={cn('ml-auto rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums', style.tint, style.text)}>{items.length}</span>
            </header>
            <p className="mb-2.5 px-1.5 text-xs text-muted-foreground">{lane.hint}</p>
            <div className="flex flex-1 flex-col gap-2.5 xl:max-h-[calc(100vh-22rem)] xl:overflow-y-auto xl:pr-1">
              {items.map((job) => (
                <JobCard key={job.id} job={job} to={jobPath(job.id)} large={wall} />
              ))}
              {items.length === 0 && <ShopEmpty title="Clear">{EMPTY[lane.key]}</ShopEmpty>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
