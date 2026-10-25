import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, CheckCheck, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useShopJob } from '@/hooks/useShop';
import { jobTitle, laneOf, LANES } from '@/lib/shop/board';
import { DownChip, LANE_STYLE, PriorityTag, TaskBar } from '@/components/shop/shared';
import { Tasks } from '@/components/shop/job/Tasks';
import { PartPicker, PartsList } from '@/components/shop/job/Parts';
import { Activity } from '@/components/shop/job/Activity';
import { ClockBar } from '@/components/shop/job/ClockBar';
import { Facts } from '@/components/shop/job/Facts';
import { BlockDialog, FinishDialog } from '@/components/shop/job/Dialogs';
import { TruckRecent } from '@/components/shop/job/TruckRecent';

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-condensed text-xl font-bold leading-none">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** One job in full, for the office: who is on it, what is done, what was used, and the whole story. */
export default function ShopJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: detail, isLoading, error } = useShopJob(id);
  const [partsOpen, setPartsOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  if (error || !detail) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost"><Link to="/shop"><ArrowLeft className="mr-2 h-4 w-4" />Back to the board</Link></Button>
        <p className="text-sm text-muted-foreground">{error ? (error as Error).message : 'That job could not be found. It may have been archived.'}</p>
      </div>
    );
  }

  const { job, raw } = detail;
  const done = job.status === 'completed';
  const lane = laneOf(job);
  const laneInfo = LANES.find((l) => l.key === lane)!;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="-ml-3 h-10"><Link to="/shop"><ArrowLeft className="mr-2 h-4 w-4" />Shop board</Link></Button>

      <header className={cn('flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-condensed text-5xl font-bold leading-none">{job.unit}</span>
            <PriorityTag priority={job.priority} />
            <span className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', done ? 'bg-success/15 text-success' : cn(LANE_STYLE[lane].tint, LANE_STYLE[lane].text))}>{done ? 'Finished' : laneInfo.title}</span>
          </div>
          <p className="mt-1 text-lg font-medium">{jobTitle(job)}</p>
          <p className="text-sm text-muted-foreground">{[job.truckName, job.odometer ? `${job.odometer.toLocaleString()} mi` : null, `In ${format(parseISO(job.entryDate), 'MMM d')}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DownChip job={job} />
          <TaskBar done={job.tasksDone} total={job.tasksTotal} className="w-44" />
        </div>
      </header>

      {job.description && <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm">{job.description}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ClockBar detail={detail} />
          <Card title="Checklist"><Tasks detail={detail} /></Card>
          <Card title="Parts used"><PartsList detail={detail} onAdd={() => setPartsOpen(true)} /></Card>
          <Card title="Notes and photos"><Activity detail={detail} /></Card>
        </div>

        <div className="space-y-4">
          <Card title="Job details"><Facts detail={detail} /></Card>
          {!done && (
            <div className="grid gap-2">
              {job.status !== 'parts_ordered' && (
                <Button variant="outline" className="h-12 gap-2 border-warning/50 text-warning hover:bg-warning/10" onClick={() => setBlockOpen(true)}>
                  <PauseCircle className="h-5 w-5" />Waiting on something
                </Button>
              )}
              <Button className="h-12 gap-2 bg-success text-white hover:bg-success" onClick={() => setFinishOpen(true)}>
                <CheckCheck className="h-5 w-5" />Finish the job
              </Button>
            </div>
          )}
          <Card title="Recent work on this truck"><TruckRecent truckId={job.truckId} excludeId={job.id} /></Card>
          {raw?.estimated_completion && <p className="text-xs text-muted-foreground">Needed by {format(parseISO(raw.estimated_completion), 'MMM d, yyyy')}</p>}
        </div>
      </div>

      <PartPicker jobId={job.id} open={partsOpen} onOpenChange={setPartsOpen} />
      <BlockDialog detail={detail} open={blockOpen} onOpenChange={setBlockOpen} />
      <FinishDialog detail={detail} open={finishOpen} onOpenChange={setFinishOpen} onDone={() => navigate('/shop')} />
    </div>
  );
}
