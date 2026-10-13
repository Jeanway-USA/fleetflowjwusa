import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { usePMSchedule } from '@/hooks/useMaintenanceData';
import { useShopBoard } from '@/hooks/useShop';
import { toLocalIso } from '@/lib/datetime';
import { buildPlanner, planCounts, projectedDate, remainingLabel, sortPlan, type PlannerItem, type PlanStatus } from '@/lib/shop/planner';
import { NewJobSheet } from '@/components/shop/NewJobSheet';
import { ShopNav } from '@/components/shop/ShopNav';
import { ShopEmpty } from '@/components/shop/shared';

const TONE: Record<PlanStatus, { rail: string; text: string; bar: string; label: string }> = {
  overdue: { rail: 'border-l-red-500', text: 'text-red-400', bar: 'bg-red-500', label: 'Overdue' },
  soon: { rail: 'border-l-orange-500', text: 'text-orange-300', bar: 'bg-orange-500', label: 'Due soon' },
  ok: { rail: 'border-l-emerald-500/60', text: 'text-emerald-400', bar: 'bg-emerald-500', label: 'On track' },
};

type View = 'attention' | 'trucks' | 'forecast';

/** Service that is due or coming due, by truck. One tap schedules a job with its checklist already filled in. */
export default function ShopPlannerPage() {
  const { data: trucks = [], isLoading } = usePMSchedule();
  const { data: board } = useShopBoard();
  const [view, setView] = useState<View>('attention');
  const [schedule, setSchedule] = useState<PlannerItem | null>(null);

  const items = useMemo(() => buildPlanner(trucks), [trucks]);
  const counts = planCounts(items);

  // How far each truck runs in a day, from the last 60 days of delivered loads.
  const { data: dailyMiles = new Map<string, number>() } = useQuery({
    queryKey: ['shop', 'daily-miles'],
    queryFn: async () => {
      const since = toLocalIso(subDays(new Date(), 60));
      const { data } = await supabase.from('fleet_loads').select('truck_id, actual_miles, booked_miles').eq('status', 'delivered').not('truck_id', 'is', null).gte('delivery_date', since).is('deleted_at', null);
      const totals = new Map<string, number>();
      for (const r of data ?? []) totals.set(r.truck_id as string, (totals.get(r.truck_id as string) ?? 0) + (Number(r.actual_miles) || Number(r.booked_miles) || 0));
      return new Map([...totals].map(([id, miles]) => [id, miles / 60]));
    },
    staleTime: 10 * 60_000,
  });

  const scheduledFor = (i: PlannerItem) => board?.jobs.find((j) => j.truckId === i.truckId && (j.serviceTypes.includes(i.kind) || j.serviceType === i.kind)) ?? null;

  const attention = sortPlan(items).filter((i) => i.status !== 'ok');
  const byTruck = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const i of sortPlan(items)) map.set(i.truckId, [...(map.get(i.truckId) ?? []), i]);
    return [...map.entries()].sort((a, b) => ({ overdue: 0, soon: 1, ok: 2 })[a[1][0].status] - ({ overdue: 0, soon: 1, ok: 2 })[b[1][0].status] || a[1][0].unit.localeCompare(b[1][0].unit, undefined, { numeric: true }));
  }, [items]);
  const forecast = useMemo(() => {
    return items
      .map((i) => ({ i, when: projectedDate(i, dailyMiles.get(i.truckId) ?? 0) }))
      .filter((x): x is { i: PlannerItem; when: Date } => !!x.when)
      .sort((a, b) => a.when.getTime() - b.when.getTime())
      .slice(0, 40);
  }, [items, dailyMiles]);

  const Row = ({ i, showUnit = true }: { i: PlannerItem; showUnit?: boolean }) => {
    const tone = TONE[i.status];
    const pct = Math.max(0, Math.min(100, Math.round((i.used / Math.max(1, i.interval)) * 100)));
    const existing = scheduledFor(i);
    return (
      <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-l-4 bg-card p-3.5', tone.rail)}>
        {showUnit && <span className="w-20 shrink-0 font-condensed text-3xl font-bold leading-none">{i.unit}</span>}
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-medium">{i.name}</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${pct}%` }} /></div>
        </div>
        <p className={cn('w-40 shrink-0 text-sm font-semibold tabular-nums', tone.text)}>{remainingLabel(i)}</p>
        {existing ? (
          <Button asChild variant="outline" className="h-10 min-w-[130px]"><Link to={`/shop/jobs/${existing.id}`}>Job open</Link></Button>
        ) : (
          <Button className="h-10 min-w-[130px]" variant={i.status === 'ok' ? 'outline' : 'default'} onClick={() => setSchedule(i)}>Schedule a job</Button>
        )}
      </li>
    );
  };

  return (
    <div>
      <header className="mb-4">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CalendarClock className="h-4 w-4 text-primary" />Shop</p>
        <h1 className="font-condensed text-[32px] font-bold leading-tight">Service planner</h1>
      </header>
      <ShopNav />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {(['overdue', 'soon', 'ok'] as PlanStatus[]).map((s) => (
          <div key={s} className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TONE[s].label}</p>
            <p className={cn('mt-1 font-condensed text-4xl font-bold leading-none tabular-nums', counts[s] > 0 && TONE[s].text)}>{counts[s]}</p>
          </div>
        ))}
      </div>

      <div role="tablist" className="mb-4 inline-flex rounded-xl bg-muted p-1">
        {([['attention', `Needs attention (${attention.length})`], ['trucks', 'By truck'], ['forecast', 'Coming up']] as Array<[View, string]>).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn('min-h-[44px] rounded-lg px-4 text-sm font-medium', view === k ? 'bg-background shadow' : 'text-muted-foreground')}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : view === 'attention' ? (
        attention.length === 0 ? <ShopEmpty icon={CalendarClock} title="Nothing is due">Every truck is within its service intervals.</ShopEmpty> : <ul className="space-y-2">{attention.map((i) => <Row key={`${i.truckId}-${i.name}`} i={i} />)}</ul>
      ) : view === 'trucks' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {byTruck.map(([id, list]) => (
            <section key={id} className="rounded-2xl border bg-muted/30 p-3">
              <h2 className="mb-2 px-1 font-condensed text-2xl font-bold">{list[0].unit} <span className="text-sm font-normal text-muted-foreground">{list[0].make}</span></h2>
              <ul className="space-y-2">{list.map((i) => <Row key={i.name} i={i} showUnit={false} />)}</ul>
            </section>
          ))}
        </div>
      ) : forecast.length === 0 ? (
        <ShopEmpty icon={CalendarClock} title="Nothing to forecast yet">The forecast uses how far each truck has run in the last 60 days.</ShopEmpty>
      ) : (
        <ul className="space-y-2">
          {forecast.map(({ i, when }) => (
            <li key={`${i.truckId}-${i.name}`} className="flex items-center gap-4 rounded-2xl border bg-card p-3.5">
              <div className="w-16 shrink-0 text-center"><p className="font-condensed text-3xl font-bold leading-none">{format(when, 'd')}</p><p className="text-xs uppercase text-muted-foreground">{format(when, 'MMM')}</p></div>
              <span className="w-16 shrink-0 font-condensed text-2xl font-bold">{i.unit}</span>
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', TONE[i.status].text)}>{remainingLabel(i)}</span>
            </li>
          ))}
        </ul>
      )}

      <NewJobSheet open={!!schedule} onOpenChange={(v) => !v && setSchedule(null)} truckId={schedule?.truckId} kind={schedule?.kind} description={schedule ? `${schedule.name}: ${remainingLabel(schedule).toLowerCase()}` : undefined} />
    </div>
  );
}
