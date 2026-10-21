import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Hand, Plus, Search, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName, useShopActions, useShopBoard } from '@/hooks/useShop';
import { jobTitle, laneOf, sortJobs, type ShopJob } from '@/lib/shop/board';
import { DownChip, LANE_STYLE, PriorityTag, RunningClock, ShopEmpty, TaskBar } from '@/components/shop/shared';
import { NewJobSheet } from '@/components/shop/NewJobSheet';
import { ShiftClock } from '@/components/shop/ShiftClock';

type View = 'mine' | 'next' | 'all';

function Tile({ job, mine, onTake }: { job: ShopJob; mine: boolean; onTake: () => void }) {
  const lane = laneOf(job);
  const open = !job.assignedTo && !job.assignedName && lane === 'queue';
  return (
    <div className={'flex flex-col rounded-lg border bg-card p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-condensed text-6xl font-bold leading-none">{job.unit}</p>
          <p className="mt-1 truncate text-base text-muted-foreground">{job.truckName}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5"><PriorityTag priority={job.priority} className="text-xs" /><DownChip job={job} className="text-sm" /></div>
      </div>
      <p className="mt-3 text-xl font-semibold leading-snug">{jobTitle(job)}</p>
      {job.description && <p className="mt-1 line-clamp-2 text-base text-muted-foreground">{job.description}</p>}
      {job.blockedReason && lane === 'waiting' && <p className="mt-2 rounded-lg bg-orange-500/10 px-3 py-2 text-base font-medium text-orange-300">{job.blockedReason}</p>}
      <TaskBar done={job.tasksDone} total={job.tasksTotal} className="mt-4 [&_span]:text-sm" />
      <div className="mt-4 flex items-center gap-3">
        {job.runningTimer && <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-base font-bold text-primary"><Timer className="h-4 w-4" /><RunningClock since={job.runningTimer.startedAt} /></span>}
        {!mine && job.assignedName && <span className="text-sm text-muted-foreground">{job.assignedName}</span>}
        <div className="ml-auto flex gap-2">
          {open && <Button className="h-14 gap-2 px-5 text-base gradient-gold text-primary-foreground" onClick={onTake}><Hand className="h-5 w-5" />Take it</Button>}
          <Button asChild variant={open ? 'outline' : 'default'} className="h-14 gap-2 px-5 text-base"><Link to={`/shop/floor/jobs/${job.id}`}>Open<ArrowRight className="h-5 w-5" /></Link></Button>
        </div>
      </div>
    </div>
  );
}

/** The mechanic's home: what is mine, what is up next, and everything in the shop. */
export default function FloorJobsPage() {
  const { user } = useAuth();
  const me = useMyName();
  const navigate = useNavigate();
  const actions = useShopActions();
  const { data, isLoading } = useShopBoard();
  const [view, setView] = useState<View>('mine');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const jobs = data?.jobs ?? [];
  const isMine = (j: ShopJob) => j.assignedTo === user?.id || (!!j.assignedName && j.assignedName === me) || j.runningTimer?.userName === me;
  const lists = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (j: ShopJob) => !q || `${j.unit} ${j.truckName} ${jobTitle(j)}`.toLowerCase().includes(q);
    const sorted = sortJobs(jobs).filter(match);
    return { mine: sorted.filter(isMine), next: sorted.filter((j) => laneOf(j) === 'queue' && !isMine(j)), all: sorted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, user?.id, me]);

  const take = (job: ShopJob) =>
    actions.assign.mutate(
      { id: job.id, userId: user?.id ?? null, name: me },
      { onSuccess: () => { actions.startJob.mutate({ id: job.id }, { onSuccess: () => navigate(`/shop/floor/jobs/${job.id}`), onError: (e: any) => toast.error(e.message) }); }, onError: (e: any) => toast.error(e.message) },
    );

  const shown = lists[view];
  const SEGMENTS: Array<{ key: View; label: string }> = [
    { key: 'mine', label: `Mine (${lists.mine.length})` },
    { key: 'next', label: `Up next (${lists.next.length})` },
    { key: 'all', label: `Everything (${lists.all.length})` },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ShiftClock touch />
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Which jobs" className="flex rounded-md bg-muted p-1.5">
          {SEGMENTS.map((s) => (
            <button key={s.key} role="tab" aria-selected={view === s.key} onClick={() => setView(s.key)} className={cn('min-h-[52px] rounded-lg px-5 text-base font-semibold transition-colors', view === s.key ? 'bg-background shadow' : 'text-muted-foreground')}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a truck" className="h-14 pl-12 sm:pl-12 text-lg" />
        </div>
        <Button className="h-14 gap-2 px-6 text-base gradient-gold text-primary-foreground" onClick={() => setNewOpen(true)}><Plus className="h-5 w-5" />New job</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}</div>
      ) : shown.length === 0 ? (
        <ShopEmpty title={view === 'mine' ? 'Nothing assigned to you' : 'Nothing here'}>{view === 'mine' ? 'Take a job from Up next, or ask the office to assign you one.' : 'When a truck comes in it shows up here.'}</ShopEmpty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{shown.map((j) => <Tile key={j.id} job={j} mine={isMine(j)} onTake={() => take(j)} />)}</div>
      )}

      <NewJobSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
