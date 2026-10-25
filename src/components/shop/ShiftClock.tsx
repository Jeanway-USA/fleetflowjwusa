import { toast } from 'sonner';
import { AlertTriangle, Coffee, LogIn, LogOut, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { cn } from '@/lib/utils';
import { useMyShift, useShiftActions } from '@/hooks/useShift';
import { formatMinutes } from '@/lib/shop/board';
import { RunningClock, useNow } from '@/components/shop/shared';
import { runningClockState, STOP_AFTER_HOURS, WARN_AFTER_HOURS } from '@/lib/shop/hours';

/**
 * The shift clock: what a mechanic is paid from. It runs from clock in to clock out, whether or not a job timer is
 * running. Lunch is paid: a meal break stops any job timer but never takes time off the pay.
 */
export function ShiftClock({ touch, className }: { touch?: boolean; className?: string }) {
  const { ready, shift, isLoading } = useMyShift();
  const actions = useShiftActions();
  const now = useNow(30_000);
  if (!ready || isLoading) return null;

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const btn = touch ? 'h-16 min-w-[170px] gap-2 text-lg' : 'h-11 gap-2';

  if (!shift) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4', className)}>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Shift clock</p>
          <p className={cn('font-condensed font-bold leading-none', touch ? 'text-4xl' : 'text-2xl')}>Not clocked in</p>
        </div>
        <LoadingButton loading={actions.clockIn.isPending} disabled={actions.clockIn.isPending} className={cn('bg-primary text-primary-foreground hover:bg-primary/90', btn)} onClick={() => actions.clockIn.mutate(undefined, { onError: fail })}>
          <LogIn className="h-5 w-5" />Clock in
        </LoadingButton>
      </div>
    );
  }

  const onMeal = !!shift.mealStartedAt;
  const mealRunning = onMeal ? Math.max(0, (now.getTime() - new Date(shift.mealStartedAt!).getTime()) / 60_000) : 0;
  const state = runningClockState(shift.startedAt, now.getTime());
  const warn = state !== 'ok';

  return (
    <div className={cn('rounded-lg border p-4', onMeal ? 'border-warning/50 bg-warning/10' : 'border-success/40 bg-success/10', className)}>
      {warn && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {state === 'stopped'
            ? `This shift ran past ${STOP_AFTER_HOURS} hours, so it was stopped and sent for review.`
            : `You have been clocked in for more than ${WARN_AFTER_HOURS} hours. Clock out if you are done. The clock stops itself at ${STOP_AFTER_HOURS} hours and the owner reviews it.`}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{onMeal ? 'At lunch' : 'You are clocked in'}</p>
          <p className={cn('font-condensed font-bold leading-none', touch ? 'text-6xl' : 'text-4xl', onMeal ? 'text-warning' : 'text-success')}>
            {onMeal ? formatMinutes(mealRunning) : <RunningClock since={shift.startedAt} />}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {onMeal
              ? 'Lunch is paid time.'
              : shift.mealMinutes > 0 ? `Lunch so far: ${formatMinutes(shift.mealMinutes)}` : 'Time on a job is counted inside your shift.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onMeal ? (
            <LoadingButton loading={actions.mealEnd.isPending} disabled={actions.mealEnd.isPending} className={cn('bg-primary text-primary-foreground hover:bg-primary/90', btn)} onClick={() => actions.mealEnd.mutate(undefined, { onError: fail })}>
              <Play className="h-5 w-5" />Back to work
            </LoadingButton>
          ) : (
            <Button variant="outline" className={btn} disabled={actions.mealStart.isPending} onClick={() => actions.mealStart.mutate(undefined, { onError: fail })}>
              <Coffee className="h-5 w-5" />Lunch
            </Button>
          )}
          <LoadingButton loading={actions.clockOut.isPending} disabled={actions.clockOut.isPending} className={cn('bg-muted-foreground text-white hover:bg-muted-foreground', btn)} onClick={() => actions.clockOut.mutate(undefined, { onError: fail })}>
            <LogOut className="h-5 w-5" />Clock out
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
