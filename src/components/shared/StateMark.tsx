import { cn } from '@/lib/utils';
import { logbookState, type LogbookState } from '@/lib/settlement-week';

const LABEL: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  booked: 'Booked',
  dispatched: 'Dispatched',
  loading: 'Loading',
  at_pickup: 'At pickup',
  in_transit: 'In transit',
  at_delivery: 'At delivery',
  unloading: 'Unloading',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

/**
 * The logbook's state marks: open ring = planned, filled dot = moving,
 * filled square = delivered, struck = cancelled. Same marks as the week strip.
 */
export function StateMark({ status, className, showLabel = true }: { status: string | null; className?: string; showLabel?: boolean }) {
  const state: LogbookState = logbookState(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', state === 'cancelled' && 'text-muted-foreground line-through', className)}>
      <span
        aria-hidden
        className={cn(
          'inline-block h-2.5 w-2.5 shrink-0',
          state === 'planned' && 'rounded-full border-2 border-muted-foreground',
          state === 'moving' && 'rounded-full bg-foreground',
          state === 'delivered' && 'rounded-[2px] bg-success',
          state === 'cancelled' && 'rounded-full border-2 border-muted-foreground/60',
        )}
      />
      {showLabel && <span className={cn(state === 'delivered' && 'text-success')}>{LABEL[status ?? ''] ?? status ?? 'Unknown'}</span>}
    </span>
  );
}
