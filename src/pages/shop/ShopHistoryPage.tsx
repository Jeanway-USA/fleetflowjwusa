import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, parseISO, subDays } from 'date-fns';
import { History, NotebookPen, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toLocalIso } from '@/lib/datetime';
import { jobTitle, money } from '@/lib/shop/board';
import { WORK_KINDS } from '@/lib/shop/templates';
import { ShopNav } from '@/components/shop/ShopNav';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { LogWorkSheet } from '@/components/shop/LogWorkSheet';
import { Button } from '@/components/ui/button';
import { ShopEmpty } from '@/components/shop/shared';

interface Entry {
  id: string;
  source: 'job' | 'log';
  truckId: string;
  unit: string;
  date: string;
  title: string;
  kinds: string[];
  vendor: string | null;
  cost: number;
  notes: string | null;
  daysDown: number | null;
}

const RANGES = [{ key: '30', label: '30 days', days: 30 }, { key: '90', label: '90 days', days: 90 }, { key: '365', label: 'This year', days: 365 }, { key: 'all', label: 'Everything', days: 0 }];

function useHistory() {
  return useQuery({
    queryKey: ['shop', 'history'],
    queryFn: async (): Promise<Entry[]> => {
      const [{ data: jobs, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
        supabase.from('work_orders').select('id, truck_id, vendor, entry_date, estimated_completion, completed_at, service_type, service_types, description, notes, final_cost, days_down, trucks (unit_number)').eq('status', 'completed').is('deleted_at', null).limit(2000),
        supabase.from('maintenance_logs').select('id, truck_id, vendor, service_date, service_type, description, cost, trucks (unit_number)').is('deleted_at', null).limit(2000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const fromJobs: Entry[] = (jobs ?? []).map((j) => {
        const kinds = (j.service_types && j.service_types.length > 0 ? j.service_types : [j.service_type]).filter(Boolean) as string[];
        return { id: j.id, source: 'job', truckId: j.truck_id, unit: (j.trucks as any)?.unit_number ?? '—', date: j.estimated_completion || j.entry_date, title: jobTitle({ serviceType: j.service_type ?? '', serviceTypes: kinds }), kinds, vendor: j.vendor, cost: Number(j.final_cost) || 0, notes: j.notes || j.description, daysDown: j.days_down };
      });
      const fromLogs: Entry[] = (logs ?? []).map((l) => ({ id: l.id, source: 'log', truckId: l.truck_id, unit: (l.trucks as any)?.unit_number ?? '—', date: l.service_date, title: jobTitle({ serviceType: l.service_type ?? '', serviceTypes: [] }), kinds: [l.service_type].filter(Boolean) as string[], vendor: l.vendor, cost: Number(l.cost) || 0, notes: l.description, daysDown: null }));
      return [...fromJobs, ...fromLogs].sort((a, b) => b.date.localeCompare(a.date));
    },
  });
}

/** Everything ever done to the fleet, searchable by truck, kind of work and date, with what it cost. */
export default function ShopHistoryPage() {
  const { data = [], isLoading, error } = useHistory();
  const [search, setSearch] = useState('');
  const [truck, setTruck] = useState('__all__');
  const [kind, setKind] = useState('__all__');
  const [range, setRange] = useState('90');
  const [logOpen, setLogOpen] = useState(false);

  const trucks = useMemo(() => Array.from(new Map(data.map((e) => [e.truckId, e.unit])).entries()).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })), [data]);
  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 0;
    const since = days ? toLocalIso(subDays(new Date(), days)) : '';
    const q = search.trim().toLowerCase();
    return data.filter((e) => (!since || e.date >= since) && (truck === '__all__' || e.truckId === truck) && (kind === '__all__' || e.kinds.some((k) => k.toLowerCase() === kind.toLowerCase())) && (!q || `${e.unit} ${e.title} ${e.vendor ?? ''} ${e.notes ?? ''}`.toLowerCase().includes(q)));
  }, [data, search, truck, kind, range]);

  const total = shown.reduce((s, e) => s + e.cost, 0);
  const downs = shown.filter((e) => e.daysDown != null);
  const avgDown = downs.length ? downs.reduce((s, e) => s + (e.daysDown ?? 0), 0) / downs.length : null;
  const months = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of shown) map.set(e.date.slice(0, 7), [...(map.get(e.date.slice(0, 7)) ?? []), e]);
    return [...map.entries()];
  }, [shown]);

  return (
    <div>
      <PageHeader title="Service history">
        <Button className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setLogOpen(true)}><NotebookPen className="h-4 w-4" />Log work done</Button>
      </PageHeader>
      <ShopNav />

      <StatStrip className="mb-4" cells={[{ label: 'Jobs', value: String(shown.length) }, { label: 'Spent', value: money(total) }, { label: 'Avg days down', value: avgDown == null ? '—' : avgDown.toFixed(1) }]} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search work, vendor or notes" className="h-11 pl-9 sm:pl-9" />
        </div>
        <Select value={truck} onValueChange={setTruck}>
          <SelectTrigger className="h-11 w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">All trucks</SelectItem>{trucks.map(([id, unit]) => <SelectItem key={id} value={id}>Unit {unit}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-11 w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">All kinds of work</SelectItem>{WORK_KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
        </Select>
        <div role="tablist" className="flex rounded-md bg-muted p-1">
          {RANGES.map((r) => <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)} className={cn('min-h-[40px] rounded-sm px-3 text-sm font-medium', range === r.key ? 'bg-background shadow' : 'text-muted-foreground')}>{r.label}</button>)}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : shown.length === 0 ? (
        <ShopEmpty icon={History} title="Nothing in that range">Try a longer range or clear the filters.</ShopEmpty>
      ) : (
        <div className="space-y-5">
          {months.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 flex items-baseline gap-2 font-condensed text-xl font-bold">{format(parseISO(`${month}-01`), 'MMMM yyyy')}<span className="text-sm font-normal text-muted-foreground">{list.length} job{list.length === 1 ? '' : 's'}, {money(list.reduce((s, e) => s + e.cost, 0))}</span></h2>
              <ul className="space-y-2">
                {list.map((e) => {
                  const body = (
                    <>
                      <div className="w-14 shrink-0 text-center"><p className="font-condensed text-2xl font-bold leading-none">{format(parseISO(e.date), 'd')}</p><p className="text-xs text-muted-foreground">{format(parseISO(e.date), 'EEE')}</p></div>
                      <span className="w-16 shrink-0 font-condensed text-2xl font-bold">{e.unit}</span>
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.title}</p><p className="truncate text-xs text-muted-foreground">{[e.vendor, e.notes].filter(Boolean).join(' · ') || (e.source === 'log' ? 'Logged service' : 'Shop job')}</p></div>
                      <div className="shrink-0 text-right"><p className="tabular-nums font-semibold">{e.cost ? money(e.cost) : '—'}</p>{e.daysDown != null && <p className="text-xs text-muted-foreground">{e.daysDown}d down</p>}</div>
                    </>
                  );
                  return (
                    <li key={`${e.source}-${e.id}`}>
                      {e.source === 'job' ? <Link to={`/shop/jobs/${e.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent">{body}</Link> : <div className="flex items-center gap-3 rounded-lg border bg-card p-3">{body}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <LogWorkSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
