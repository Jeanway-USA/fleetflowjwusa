import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAllPartsInventory, type PartInventoryItem } from '@/hooks/useMaintenanceData';
import { useShopBoard } from '@/hooks/useShop';
import { jobTitle, sortJobs } from '@/lib/shop/board';
import { PartPicker } from '@/components/shop/job/Parts';
import { ShopEmpty } from '@/components/shop/shared';

/**
 * The shelf, on the tablet. Browse what is in stock; tap a part and choose which job it went on. Parts are always
 * logged against a job, so stock and job cost stay tied together.
 */
export default function FloorPartsPage() {
  const { data: parts = [], isLoading } = useAllPartsInventory();
  const { data } = useShopBoard();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [chosen, setChosen] = useState<PartInventoryItem | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const jobs = useMemo(() => sortJobs(data?.jobs ?? []), [data]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((p) => !(p as { deleted_at?: string | null }).deleted_at).filter((p) => (!q || `${p.part_name} ${p.part_number ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q)) && (!lowOnly || Number(p.quantity_on_hand) <= Number(p.min_threshold)));
  }, [parts, search, lowOnly]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a part" className="h-14 pl-12 sm:pl-12 text-lg" />
        </div>
        <button type="button" onClick={() => setLowOnly((v) => !v)} aria-pressed={lowOnly} className={cn('min-h-[56px] rounded-2xl border px-5 text-base font-semibold', lowOnly ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'hover:bg-accent')}>Low stock only</button>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading the shelf…</p> : shown.length === 0 ? (
        <ShopEmpty title="No parts match" />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {shown.map((p) => {
            const out = Number(p.quantity_on_hand) <= 0;
            const low = !out && Number(p.quantity_on_hand) <= Number(p.min_threshold);
            return (
              <li key={p.id}>
                <button type="button" disabled={out} onClick={() => setChosen(p)} className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl border bg-card px-4 text-left transition-colors hover:bg-accent disabled:opacity-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-medium">{p.part_name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{[p.part_number, p.category].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={cn('shrink-0 text-right font-condensed text-3xl font-bold tabular-nums', out ? 'text-red-400' : low ? 'text-orange-300' : '')}>
                    {Number(p.quantity_on_hand)}
                    <span className="block font-sans text-xs font-normal text-muted-foreground">{out ? 'out' : low ? 'low' : p.unit}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!chosen && !jobId} onOpenChange={(v) => !v && setChosen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="font-condensed text-2xl">Which job is it for?</DialogTitle>
            <DialogDescription>{chosen?.part_name}</DialogDescription>
          </DialogHeader>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no open jobs. Start a job first, then log the part to it.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => setJobId(j.id)} className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-4 text-left hover:bg-accent">
                    <span className="font-condensed text-3xl font-bold">{j.unit}</span>
                    <span className="text-base">{jobTitle(j)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {chosen && jobId && (
        <PartPicker jobId={jobId} open initialPart={chosen} touch onOpenChange={(v) => { if (!v) { setChosen(null); setJobId(null); } }} />
      )}
    </div>
  );
}
