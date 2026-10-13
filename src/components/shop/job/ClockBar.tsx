import { toast } from 'sonner';
import { AlertCircle, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useShopActions, type ShopJobDetail } from '@/hooks/useShop';
import { entryMinutes, formatMinutes } from '@/lib/shop/board';
import { RunningClock, useNow } from '@/components/shop/shared';

/** Start, pause and resume work on a job, with the time so far. One running clock per mechanic. */
export function ClockBar({ detail, touch }: { detail: ShopJobDetail; touch?: boolean }) {
  const { user } = useAuth();
  const actions = useShopActions();
  const now = useNow(30_000);
  const { job } = detail;
  const mine = detail.time.find((t) => t.user_id === user?.id && !t.ended_at) ?? null;
  const other = detail.time.find((t) => t.user_id !== user?.id && !t.ended_at) ?? null;
  const total = detail.time.reduce((s, t) => s + entryMinutes({ startedAt: t.started_at, endedAt: t.ended_at }, now), 0);
  const blocked = job.status === 'parts_ordered';

  if (job.status === 'completed') {
    return <div className="rounded-2xl border bg-emerald-500/10 p-4 text-emerald-300">Finished. {formatMinutes(total)} logged.</div>;
  }

  const start = () => {
    const go = () => actions.startJob.mutate({ id: job.id }, { onError: (e: any) => toast.error(e.message) });
    if (blocked) actions.unblock.mutate({ id: job.id }, { onSuccess: go, onError: (e: any) => toast.error(e.message) });
    else go();
  };

  return (
    <div className={cn('rounded-2xl border p-4', mine ? 'border-primary/50 bg-primary/10' : 'bg-card')}>
      {blocked && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Waiting: {job.blockedReason ?? 'no reason given'}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{mine ? 'You are on the clock' : other ? `${other.user_name ?? 'Someone'} is on the clock` : 'Time on this job'}</p>
          <p className={cn('font-condensed font-bold leading-none', touch ? 'text-6xl' : 'text-4xl', mine && 'text-primary')}>
            {mine ? <RunningClock since={mine.started_at} /> : formatMinutes(total)}
          </p>
          {mine && <p className="mt-1 text-xs text-muted-foreground">{formatMinutes(total)} in total on this job</p>}
        </div>
        {mine ? (
          <LoadingButton loading={actions.pauseJob.isPending} disabled={actions.pauseJob.isPending} onClick={() => actions.pauseJob.mutate(undefined, { onError: (e: any) => toast.error(e.message) })} className={cn('gap-2 bg-slate-700 text-white hover:bg-slate-600', touch ? 'h-20 min-w-[180px] text-xl' : 'h-12 min-w-[130px]')}>
            <Pause className="h-6 w-6" />Pause
          </LoadingButton>
        ) : (
          <Button className={cn('gap-2 gradient-gold text-primary-foreground', touch ? 'h-20 min-w-[200px] text-xl' : 'h-12 min-w-[150px]')} disabled={actions.startJob.isPending || actions.unblock.isPending} onClick={start}>
            <Play className="h-6 w-6" />{detail.time.length > 0 || blocked ? 'Resume work' : 'Start work'}
          </Button>
        )}
      </div>
    </div>
  );
}
