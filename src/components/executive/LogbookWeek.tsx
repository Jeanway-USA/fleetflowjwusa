import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { cityState } from '@/lib/formatters';
import { layoutLogbook, logbookState, settlementWeek, type LogbookState } from '@/lib/settlement-week';

interface WeekLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  status: string | null;
  gross_revenue: number | null;
  net_revenue: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  booked: 'Booked',
  loading: 'Loading',
  at_pickup: 'At pickup',
  in_transit: 'In transit',
  at_delivery: 'At delivery',
  unloading: 'Unloading',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

const money = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const place = (s: string | null) => cityState(s) || 'Unknown';

const DAY_LETTERS = ['Th', 'Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We'];

/** One hairline per day column, the ruling of a log page. */
const gridRuling: React.CSSProperties = {
  backgroundImage: 'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)',
  backgroundSize: 'calc(100% / 7) 100%',
};

function SegmentLine({ state, continuesBefore, continuesAfter }: { state: LogbookState; continuesBefore: boolean; continuesAfter: boolean }) {
  const color =
    state === 'delivered' ? 'bg-success' : state === 'moving' ? 'bg-foreground' : 'bg-muted-foreground';
  const markColor =
    state === 'delivered' ? 'bg-success border-success' : state === 'moving' ? 'border-foreground' : 'border-muted-foreground';

  return (
    <div className="relative h-full">
      {state === 'planned' ? (
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-muted-foreground/70"
        />
      ) : (
        <div className={cn('absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full', color)} />
      )}
      {!continuesBefore && (
        <span
          className={cn(
            'absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full',
            state === 'planned' ? 'border-2 border-muted-foreground bg-card' : state === 'delivered' ? 'bg-success' : 'bg-foreground',
          )}
        />
      )}
      {!continuesAfter && (
        state === 'delivered' ? (
          <span className={cn('absolute right-0 top-1/2 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-[2px]', 'bg-success')} />
        ) : (
          <span className={cn('absolute right-0 top-1/2 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card', markColor)} />
        )
      )}
    </div>
  );
}

/**
 * The settlement week as a log page: seven day columns, Thursday to the
 * period-ending Wednesday, each load a line from pickup day to delivery day.
 */
export function LogbookWeek() {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const week = useMemo(() => settlementWeek(today, offset), [today, offset]);
  const first = week.isoDays[0];
  const last = week.isoDays[6];

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['logbook-week', first],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, pickup_date, delivery_date, status, gross_revenue, net_revenue')
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .lte('pickup_date', last)
        .or(`delivery_date.gte.${first},delivery_date.is.null`)
        .order('pickup_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WeekLoad[];
    },
  });

  const segments = useMemo(() => layoutLogbook(loads, week), [loads, week]);
  const todayCol = week.days.findIndex((d) => isSameDay(d, today));
  const delivered = segments.filter((s) => logbookState(s.load.status) === 'delivered');
  const deliveredNet = delivered.reduce((sum, s) => sum + (s.load.net_revenue ?? 0), 0);
  const open = segments.filter((s) => logbookState(s.load.status) !== 'delivered');
  const openNet = open.reduce((sum, s) => sum + (s.load.net_revenue ?? 0), 0);

  const goWeek = (delta: number) => { setOffset((o) => o + delta); setSelectedId(null); };

  // Swipe the page sideways to turn to the previous or next week.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goWeek(dx < 0 ? 1 : -1);
  };

  return (
    <section aria-labelledby="logbook-title" className="rounded-lg border bg-card">
      <header className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="logbook-title" className="font-condensed text-xl font-bold leading-tight">
              Week ending {format(week.end, 'EEE, MMM d')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {offset === 0 ? 'Current settlement period' : `Thu ${format(week.start, 'MMM d')} to Wed ${format(week.end, 'MMM d')}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {isLoading ? (
              <Skeleton className="ml-auto h-9 w-28" />
            ) : (
              <div className="figure text-[34px] font-bold leading-none">{money(deliveredNet)}</div>
            )}
            <div className="mt-1 text-[13px] text-muted-foreground">
              earned, {delivered.length} delivered
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground tabular-nums">
            {!isLoading && open.length > 0 && <>{open.length} more on the books, {money(openNet)}</>}
          </p>
          {offset !== 0 && (
            <Button variant="ghost" size="sm" className="h-11" onClick={() => { setOffset(0); setSelectedId(null); }}>
              This week
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Previous week" onClick={() => goWeek(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Next week" onClick={() => goWeek(1)}>
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className="relative px-4 touch-pan-y" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* Today's column, marked across every line like the day on a log page */}
        {todayCol >= 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 bg-carbon/15"
            style={{ left: `calc(1rem + (100% - 2rem) * ${todayCol} / 7)`, width: 'calc((100% - 2rem) / 7)' }}
          />
        )}

        <div className="relative grid grid-cols-7 border-b border-t py-1.5" style={gridRuling}>
          {week.days.map((d, i) => {
            const isToday = i === todayCol;
            return (
              <div key={i} className="flex flex-col items-center leading-none">
                <span className="text-xs font-semibold text-muted-foreground">{DAY_LETTERS[i]}</span>
                <span
                  className={cn(
                    'figure mt-1 text-base font-semibold',
                    isToday && 'rounded-sm bg-carbon px-1.5 text-carbon-foreground',
                  )}
                >
                  {format(d, 'd')}
                </span>
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-3 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            ))}
          </div>
        ) : segments.length === 0 ? (
          <div className="relative py-8 text-center">
            <p className="font-medium">No loads touch this week.</p>
            <Link to="/fleet-loads" className="mt-1 inline-block text-sm font-semibold text-primary underline">
              Add or find a load
            </Link>
          </div>
        ) : (
          <ul className="relative divide-y">
            {segments.map(({ load, fromCol, toCol, continuesBefore, continuesAfter }) => {
              const state = logbookState(load.status);
              const selected = selectedId === load.id;
              const lane = `${place(load.origin)} to ${place(load.destination)}`;
              return (
                <li key={load.id} className={cn(selected && 'bg-carbon/15 -mx-4 px-4')}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(selected ? null : load.id)}
                    aria-expanded={selected}
                    className="block w-full py-2.5 text-left focus-visible:outline-offset-[-2px]"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="figure text-[17px] font-bold">{load.landstar_load_id || 'No trip #'}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{lane}</span>
                      <span className="figure shrink-0 text-[17px] font-semibold">{money(load.net_revenue)}</span>
                    </div>
                    <div className="relative mt-1.5 h-4" style={gridRuling} aria-hidden>
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `calc(100% * ${fromCol} / 7 + ${continuesBefore ? '0px' : 'calc(100% / 14)'})`,
                          right: `calc(100% * ${6 - toCol} / 7 + ${continuesAfter ? '0px' : 'calc(100% / 14)'})`,
                        }}
                      >
                        <SegmentLine state={state} continuesBefore={continuesBefore} continuesAfter={continuesAfter} />
                      </div>
                    </div>
                    <span className="sr-only">
                      {STATUS_LABEL[load.status ?? ''] ?? load.status}, pickup {load.pickup_date}, delivery {load.delivery_date ?? 'not set'}
                    </span>
                  </button>

                  {selected && (
                    <div className="pb-3">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="text-right font-semibold">{STATUS_LABEL[load.status ?? ''] ?? load.status}</dd>
                        <dt className="text-muted-foreground">Pickup</dt>
                        <dd className="text-right tabular-nums">{load.pickup_date ? format(new Date(`${load.pickup_date}T00:00:00`), 'EEE, MMM d') : 'Not set'}</dd>
                        <dt className="text-muted-foreground">Delivery</dt>
                        <dd className="text-right tabular-nums">{load.delivery_date ? format(new Date(`${load.delivery_date}T00:00:00`), 'EEE, MMM d') : 'Not set'}</dd>
                        <dt className="text-muted-foreground">Gross</dt>
                        <dd className="text-right tabular-nums">{money(load.gross_revenue)}</dd>
                        <dt className="text-muted-foreground">Truck share</dt>
                        <dd className="text-right font-semibold tabular-nums">{money(load.net_revenue)}</dd>
                      </dl>
                      <Button asChild variant="outline" className="mt-3 h-11 w-full">
                        <Link to={`/fleet-loads?highlight=${load.id}`}>
                          Open load <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-muted-foreground/70" /> Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-foreground" /> Moving
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-success" /> Delivered
          </span>
        </div>
        <span className="ml-auto text-muted-foreground md:hidden">Swipe to change week</span>
      </footer>
    </section>
  );
}
