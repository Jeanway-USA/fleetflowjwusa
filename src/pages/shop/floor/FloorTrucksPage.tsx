import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useShopBoard } from '@/hooks/useShop';
import { jobTitle, laneOf } from '@/lib/shop/board';
import { NewJobSheet } from '@/components/shop/NewJobSheet';
import { TruckRecent } from '@/components/shop/job/TruckRecent';
import { LANE_STYLE, ShopEmpty } from '@/components/shop/shared';
import { TruckStatusControl } from '@/components/shop/job/TruckStatus';

const STATUS: Record<string, { label: string; style: string }> = {
  active: { label: 'On the road', style: 'text-emerald-400' },
  in_shop: { label: 'In the shop', style: 'text-primary' },
  out_of_service: { label: 'Out of service', style: 'text-red-400' },
  pending_inspection: { label: 'Needs inspection', style: 'text-orange-300' },
};

/** Every truck at a glance: where it is, what is open on it, and a one-tap way to start a job. */
export default function FloorTrucksPage() {
  const { data } = useShopBoard();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['shop', 'floor-trucks'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('trucks').select('id, unit_number, make, model, year, status, current_odometer').is('deleted_at', null).order('unit_number');
      if (error) throw error;
      return rows ?? [];
    },
  });

  const jobsByTruck = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>['jobs']>();
    for (const j of data?.jobs ?? []) map.set(j.truckId, [...(map.get(j.truckId) ?? []), j]);
    return map;
  }, [data]);

  const shown = trucks.filter((t) => `${t.unit_number} ${t.make ?? ''} ${t.model ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const open = trucks.find((t) => t.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a truck" className="h-14 pl-12 sm:pl-12 text-lg" />
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading trucks…</p> : shown.length === 0 ? <ShopEmpty title="No trucks match" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => {
            const jobs = jobsByTruck.get(t.id) ?? [];
            const st = STATUS[t.status ?? 'active'] ?? STATUS.active;
            return (
              <button key={t.id} type="button" onClick={() => setOpenId(t.id)} className="rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-condensed text-5xl font-bold leading-none">{t.unit_number}</span>
                  <span className={cn('text-sm font-semibold', jobs.length > 0 ? 'text-primary' : st.style)}>{jobs.length > 0 ? 'In the shop' : st.label}</span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{[t.year, t.make, t.model].filter(Boolean).join(' ')}</p>
                {jobs.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {jobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-2 text-sm">
                        <span className={cn('h-2 w-2 rounded-full', LANE_STYLE[laneOf(j)].dot)} />{jobTitle(j)}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
            <SheetTitle className="font-condensed text-4xl">{open?.unit_number}</SheetTitle>
            <SheetDescription>{[open?.year, open?.make, open?.model].filter(Boolean).join(' ')}{open?.current_odometer ? ` · ${open.current_odometer.toLocaleString()} mi` : ''}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {open && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Truck status</h3>
                <TruckStatusControl truckId={open.id} status={open.status} touch />
              </div>
            )}
            {open && (jobsByTruck.get(open.id) ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Open jobs</h3>
                {(jobsByTruck.get(open.id) ?? []).map((j) => (
                  <Button key={j.id} asChild variant="outline" className="h-14 w-full justify-start text-base"><Link to={`/shop/floor/jobs/${j.id}`}>{jobTitle(j)}</Link></Button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recent work</h3>
              {open && <TruckRecent truckId={open.id} excludeId="" />}
            </div>
          </div>
          <div className="border-t px-5 py-4">
            <Button className="h-14 w-full gap-2 text-base gradient-gold text-primary-foreground" onClick={() => { setNewFor(open?.id ?? null); setOpenId(null); }}><Plus className="h-5 w-5" />Start a job on this truck</Button>
          </div>
        </SheetContent>
      </Sheet>

      <NewJobSheet open={!!newFor} onOpenChange={(v) => !v && setNewFor(null)} truckId={newFor} />
    </div>
  );
}
