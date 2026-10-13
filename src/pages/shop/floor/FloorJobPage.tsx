import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCheck, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useShopJob } from '@/hooks/useShop';
import { jobTitle, laneOf } from '@/lib/shop/board';
import { DownChip, LANE_STYLE, PriorityTag, TaskBar } from '@/components/shop/shared';
import { Tasks } from '@/components/shop/job/Tasks';
import { PartPicker, PartsList } from '@/components/shop/job/Parts';
import { Activity } from '@/components/shop/job/Activity';
import { ClockBar } from '@/components/shop/job/ClockBar';
import { BlockDialog, FinishDialog } from '@/components/shop/job/Dialogs';
import { TruckRecent } from '@/components/shop/job/TruckRecent';

type Tab = 'do' | 'parts' | 'notes' | 'truck';

/** A job on the tablet: the clock, then a checklist, parts, notes and the truck's history, one tap each. */
export default function FloorJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: detail, isLoading, error } = useShopJob(id);
  const [tab, setTab] = useState<Tab>('do');
  const [partsOpen, setPartsOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  if (isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>;
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Button asChild variant="ghost" className="h-14 text-base"><Link to="/shop/floor"><ArrowLeft className="mr-2 h-5 w-5" />All jobs</Link></Button>
        <p className="text-base text-muted-foreground">{error ? (error as Error).message : 'That job could not be found.'}</p>
      </div>
    );
  }

  const { job } = detail;
  const lane = laneOf(job);
  const done = job.status === 'completed';
  const livePartCount = detail.parts.filter((p) => !p.voided_at).length;
  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'do', label: `Checklist ${job.tasksTotal ? `${job.tasksDone}/${job.tasksTotal}` : ''}`.trim() },
    { key: 'parts', label: `Parts${livePartCount ? ` (${livePartCount})` : ''}` },
    { key: 'notes', label: 'Notes and photos' },
    { key: 'truck', label: 'This truck' },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-28">
      <Button asChild variant="ghost" className="-ml-3 h-14 w-fit text-base"><Link to="/shop/floor"><ArrowLeft className="mr-2 h-5 w-5" />All jobs</Link></Button>

      <header className={cn('rounded-2xl border border-l-8 bg-card p-5', done ? 'border-l-emerald-500' : LANE_STYLE[lane].rail)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-condensed text-7xl font-bold leading-none">{job.unit}</p>
            <p className="mt-1 text-lg text-muted-foreground">{[job.truckName, job.odometer ? `${job.odometer.toLocaleString()} mi` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-col items-end gap-2"><PriorityTag priority={job.priority} className="text-sm" /><DownChip job={job} className="text-base" /></div>
        </div>
        <p className="mt-3 text-2xl font-semibold">{jobTitle(job)}</p>
        {job.description && <p className="mt-1 text-lg text-muted-foreground">{job.description}</p>}
        <TaskBar done={job.tasksDone} total={job.tasksTotal} className="mt-4 [&_span]:text-base" />
      </header>

      <ClockBar detail={detail} touch />

      <div role="tablist" aria-label="Job sections" className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1.5 md:grid-cols-4">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn('min-h-[56px] rounded-xl px-3 text-base font-semibold transition-colors', tab === t.key ? 'bg-background shadow' : 'text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'do' && <Tasks detail={detail} touch />}
        {tab === 'parts' && <PartsList detail={detail} touch onAdd={() => setPartsOpen(true)} />}
        {tab === 'notes' && <Activity detail={detail} touch />}
        {tab === 'truck' && <div className="rounded-2xl border bg-card p-4"><TruckRecent truckId={job.truckId} excludeId={job.id} /></div>}
      </div>

      {!done && (
        <div className="fixed inset-x-0 bottom-[72px] z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-28">
          <div className="mx-auto flex max-w-4xl gap-3">
            {job.status !== 'parts_ordered' && (
              <Button variant="outline" className="h-16 flex-1 gap-2 border-orange-500/50 text-lg text-orange-300 hover:bg-orange-500/10" onClick={() => setBlockOpen(true)}>
                <PauseCircle className="h-6 w-6" />Waiting
              </Button>
            )}
            <Button className="h-16 flex-[2] gap-2 bg-emerald-600 text-lg text-white hover:bg-emerald-700" onClick={() => setFinishOpen(true)}>
              <CheckCheck className="h-6 w-6" />Finish job
            </Button>
          </div>
        </div>
      )}

      <PartPicker jobId={job.id} open={partsOpen} onOpenChange={setPartsOpen} touch />
      <BlockDialog detail={detail} open={blockOpen} onOpenChange={setBlockOpen} touch />
      <FinishDialog detail={detail} open={finishOpen} onOpenChange={setFinishOpen} onDone={() => navigate('/shop/floor')} touch />
    </div>
  );
}
