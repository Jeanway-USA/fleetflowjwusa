import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Minus, PackagePlus, Plus, Search, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { cn } from '@/lib/utils';
import { useAllPartsInventory, type PartInventoryItem } from '@/hooks/useMaintenanceData';
import { useShopActions, type ShopJobDetail } from '@/hooks/useShop';
import { money } from '@/lib/shop/board';
import { ShopEmpty } from '@/components/shop/shared';

const QUICK = [1, 2, 4, 6, 8, 12];

/** Pick a part off the shelf and say how many were used. The stock comes off in one step, so it is never double-counted. */
export function PartPicker({ jobId, open, onOpenChange, touch, initialPart }: { jobId: string; open: boolean; onOpenChange: (v: boolean) => void; touch?: boolean; initialPart?: PartInventoryItem }) {
  const { data: parts = [], isLoading } = useAllPartsInventory();
  const actions = useShopActions();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<PartInventoryItem | null>(null);
  const [qty, setQty] = useState(1);
  // Opened from the shelf with a part already chosen: go straight to how many.
  useEffect(() => {
    if (open && initialPart) {
      setPicked(initialPart);
      setQty(1);
    }
  }, [open, initialPart]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((p) => !(p as { deleted_at?: string | null }).deleted_at).filter((p) => !q || `${p.part_name} ${p.part_number ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q)).slice(0, 60);
  }, [parts, search]);

  const close = (v: boolean) => {
    if (!v) {
      setPicked(null);
      setQty(1);
      setSearch('');
    }
    onOpenChange(v);
  };

  const use = () => {
    if (!picked) return;
    actions.logPart.mutate(
      { id: jobId, partId: picked.id, quantity: qty },
      {
        onSuccess: () => {
          toast.success(`${qty} x ${picked.part_name} logged to this job.`);
          close(false);
        },
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="font-condensed text-2xl">{picked ? 'How many?' : 'Add a part'}</DialogTitle>
          <DialogDescription>{picked ? picked.part_name : 'Search the shelf. The part comes off stock when you confirm.'}</DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative border-b p-3">
              <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Part name or number" className={cn('pl-9 sm:pl-9', touch ? 'h-14 text-lg' : 'h-11')} />
            </div>
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {isLoading && <li className="p-6 text-sm text-muted-foreground">Loading the shelf…</li>}
              {shown.map((p) => {
                const out = Number(p.quantity_on_hand) <= 0;
                const low = !out && Number(p.quantity_on_hand) <= Number(p.min_threshold);
                return (
                  <li key={p.id}>
                    <button type="button" disabled={out} onClick={() => { setPicked(p); setQty(1); }} className={cn('flex w-full items-center gap-3 px-4 text-left transition-colors hover:bg-accent disabled:opacity-50', touch ? 'min-h-[72px]' : 'min-h-[56px]')}>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate font-medium', touch && 'text-lg')}>{p.part_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[p.part_number, p.category].filter(Boolean).join(' · ') || 'No part number'}</span>
                      </span>
                      <span className={cn('shrink-0 text-right text-sm tabular-nums', out ? 'font-semibold text-destructive' : low ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                        {out ? 'Out of stock' : `${Number(p.quantity_on_hand)} ${p.unit}`}
                        {low && <span className="block text-xs">low</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!isLoading && shown.length === 0 && <li><ShopEmpty icon={PackagePlus} title="No parts match">Check the spelling, or add the part in the parts room.</ShopEmpty></li>}
            </ul>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="flex items-center justify-center gap-4">
              <Button type="button" variant="outline" className="h-20 w-20 rounded-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer"><Minus className="h-8 w-8" /></Button>
              <span className="min-w-[110px] text-center font-condensed text-7xl font-bold tabular-nums">{qty}</span>
              <Button type="button" variant="outline" className="h-20 w-20 rounded-lg" onClick={() => setQty((q) => Math.min(Number(picked.quantity_on_hand), q + 1))} aria-label="One more"><Plus className="h-8 w-8" /></Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK.filter((n) => n <= Number(picked.quantity_on_hand)).map((n) => (
                <button key={n} type="button" onClick={() => setQty(n)} className={cn('min-h-[48px] min-w-[56px] rounded-md border px-4 text-base font-medium', qty === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{n}</button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {Number(picked.quantity_on_hand)} {picked.unit} on the shelf{(picked as any).unit_cost ? `, ${money(Number((picked as any).unit_cost))} each` : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-14 flex-1 text-base" onClick={() => setPicked(null)}>Back</Button>
              <LoadingButton loading={actions.logPart.isPending} disabled={actions.logPart.isPending} onClick={use} className="h-14 flex-[2] bg-primary text-primary-foreground hover:bg-primary/90 text-base text-primary-foreground">Use {qty} on this job</LoadingButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** What was used on the job, with a way to put a part back if it was logged by mistake. */
export function PartsList({ detail, touch, onAdd }: { detail: ShopJobDetail; touch?: boolean; onAdd: () => void }) {
  const actions = useShopActions();
  const live = detail.parts.filter((p) => !p.voided_at);
  const total = live.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_cost), 0);
  const locked = detail.job.status === 'completed';

  return (
    <div className="space-y-3">
      {live.length === 0 ? (
        <ShopEmpty icon={PackagePlus} title="No parts used yet">Log each part as you use it so the shelf count and the job cost stay right.</ShopEmpty>
      ) : (
        <ul className="space-y-2">
          {live.map((p) => (
            <li key={p.id} className={cn('flex items-center gap-3 rounded-lg border bg-card px-3.5', touch ? 'min-h-[68px]' : 'min-h-[52px]')}>
              <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-muted font-condensed font-bold tabular-nums', touch ? 'h-11 min-w-11 text-xl' : 'h-9 min-w-9 text-base')}>{Number(p.quantity)}</span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate font-medium', touch && 'text-lg')}>{p.part_name}</span>
                <span className="block truncate text-xs text-muted-foreground">{[p.part_number, p.logged_by_name].filter(Boolean).join(' · ')}</span>
              </span>
              {Number(p.unit_cost) > 0 && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{money(Number(p.quantity) * Number(p.unit_cost))}</span>}
              {!locked && (
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Put back ${p.part_name}`} disabled={actions.voidPart.isPending} onClick={() => actions.voidPart.mutate({ lineId: p.id }, { onSuccess: () => toast.success('Put back on the shelf.'), onError: (e: any) => toast.error(e.message) })}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {live.some((p) => Number(p.unit_cost) === 0) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Some parts have no price set, so the job cost may read low. Set prices in the parts room.</p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Parts on this job <strong className="text-foreground">{money(total)}</strong></span>
        {!locked && <Button className={cn('bg-primary text-primary-foreground hover:bg-primary/90', touch ? 'h-14 px-6 text-base' : 'h-11')} onClick={onAdd}><PackagePlus className="mr-2 h-5 w-5" />Add a part</Button>}
      </div>
    </div>
  );
}
