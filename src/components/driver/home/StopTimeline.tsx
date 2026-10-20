import { format, parseISO } from 'date-fns';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StopTime } from '@/components/shared/StopTime';
import { shortDate, type LadderRow } from '@/lib/driver/load';

interface Props {
  rows: LadderRow[];
  load: {
    pickup_at?: string | null;
    pickup_tz?: string | null;
    pickup_date: string | null;
    pickup_time: string | null;
    pickup_end_time?: string | null;
    delivery_at?: string | null;
    delivery_tz?: string | null;
    delivery_date: string | null;
    delivery_time: string | null;
    delivery_end_time?: string | null;
  };
}

function doneAt(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    return format(parseISO(ts), 'EEE h:mm a');
  } catch {
    return null;
  }
}

/** The trip as a vertical timeline: green for stops behind you, a gold dot for the next one, hollow for the rest. */
export function StopTimeline({ rows, load }: Props) {
  return (
    <ol aria-label="Stops">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const sub = row.done
          ? <span>Done{doneAt(row.stop?.completed_at) ? `, ${doneAt(row.stop?.completed_at)}` : ''}</span>
          : row.next
            ? <span>You are heading here</span>
          : row.kind === 'pickup'
            ? <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} legacyDate={load.pickup_date} legacyTime={load.pickup_time} legacyEndTime={load.pickup_end_time} withDate hideSecondary />
            : row.kind === 'delivery'
              ? <StopTime utcIso={load.delivery_at} tz={load.delivery_tz} legacyDate={load.delivery_date} legacyTime={load.delivery_time} legacyEndTime={load.delivery_end_time} withDate hideSecondary />
              : <span>{shortDate(row.stop?.scheduled_date) ?? 'No time set'}</span>;
        const kind = row.kind === 'pickup' ? 'Pickup' : row.kind === 'delivery' ? 'Delivery' : `Stop ${row.index - 1}`;
        return (
          <li key={row.key} aria-current={row.next ? 'step' : undefined} className={cn('relative pl-9', !last && 'pb-5')}>
            {!last && <span aria-hidden className={cn('absolute left-[9px] top-6 bottom-0 w-0.5 rounded-full', row.done ? 'bg-success' : 'bg-muted-foreground/40')} />}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full',
                row.done && 'bg-success text-white',
                row.next && 'bg-carbon ring-4 ring-carbon/25',
                !row.done && !row.next && 'border-2 border-muted-foreground/70 bg-card',
              )}
            >
              {row.done && <Check className="h-3 w-3" strokeWidth={3} />}
              {row.next && <span className="h-1.5 w-1.5 rounded-full bg-carbon-foreground" />}
            </span>
            <p className={cn('leading-snug', row.next ? 'text-base font-semibold text-foreground' : row.done ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-foreground')}>
              {row.place}
              <span className="sr-only">, {kind}{row.done ? ', done' : row.next ? ', next' : ''}</span>
            </p>
            <p className={cn('mt-0.5 text-[13px]', row.next ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {!row.next && <span aria-hidden className="text-muted-foreground">{kind}: </span>}
              {sub}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
