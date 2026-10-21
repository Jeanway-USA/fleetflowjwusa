import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Boxes, ExternalLink, PackagePlus, Pencil, Plus, Search, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { archiveWithUndo } from '@/lib/soft-delete';
import { cn } from '@/lib/utils';
import { useAllPartsInventory, useRequestReorder, type PartInventoryItem } from '@/hooks/useMaintenanceData';
import { money } from '@/lib/shop/board';
import { ShopNav } from '@/components/shop/ShopNav';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { ShopEmpty } from '@/components/shop/shared';

const db = supabase as any;
type Filter = 'all' | 'low' | 'out';
type Part = PartInventoryItem & { unit_cost?: number | null; deleted_at?: string | null };

const stockState = (p: Part): 'out' | 'low' | 'ok' => (Number(p.quantity_on_hand) <= 0 ? 'out' : Number(p.quantity_on_hand) <= Number(p.min_threshold) ? 'low' : 'ok');

function useSavePart() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  return useMutation({
    mutationFn: async (a: { id?: string; part_name: string; part_number: string; category: string; unit: string; min_threshold: number; vendor_name: string; reorder_url: string; unit_cost: number | null; quantity_on_hand?: number }) => {
      const { id, quantity_on_hand, ...rest } = a;
      const row = { ...rest, part_number: rest.part_number || null, category: rest.category || null, vendor_name: rest.vendor_name || null, reorder_url: rest.reorder_url || null };
      if (id) {
        const { error } = await db.from('parts_inventory').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await db.from('parts_inventory').insert({ ...row, org_id: orgId, quantity_on_hand: quantity_on_hand ?? 0, last_restocked: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-parts-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock-parts'] });
    },
  });
}

function useReceive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; quantity: number; vendor: string }) => {
      const { data: cur, error: e1 } = await db.from('parts_inventory').select('quantity_on_hand').eq('id', a.id).single();
      if (e1) throw e1;
      const patch: Record<string, unknown> = { quantity_on_hand: Number(cur.quantity_on_hand) + a.quantity, last_restocked: new Date().toISOString(), reorder_requested_at: null };
      if (a.vendor.trim()) patch.vendor_name = a.vendor.trim();
      const { error } = await db.from('parts_inventory').update(patch).eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-parts-inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock-parts'] });
    },
  });
}

function PartDialog({ part, open, onOpenChange }: { part: Part | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSavePart();
  const [f, setF] = useState({ name: '', number: '', category: '', unit: 'ea', min: '0', vendor: '', url: '', cost: '', qty: '0' });
  const [seed, setSeed] = useState<string | null>(null);
  const key = open ? part?.id ?? 'new' : null;
  if (key !== seed) {
    setSeed(key);
    if (open) setF({ name: part?.part_name ?? '', number: part?.part_number ?? '', category: part?.category ?? '', unit: part?.unit ?? 'ea', min: String(part?.min_threshold ?? 0), vendor: part?.vendor_name ?? '', url: part?.reorder_url ?? '', cost: part?.unit_cost ? String(part.unit_cost) : '', qty: '0' });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    if (!f.name.trim()) return toast.error('Give the part a name.');
    save.mutate(
      { id: part?.id, part_name: f.name.trim(), part_number: f.number.trim(), category: f.category.trim(), unit: f.unit.trim() || 'ea', min_threshold: Number(f.min) || 0, vendor_name: f.vendor.trim(), reorder_url: f.url.trim(), unit_cost: f.cost ? Number(f.cost.replace(/[^0-9.]/g, '')) : null, quantity_on_hand: Number(f.qty) || 0 },
      { onSuccess: () => { toast.success(part ? 'Part saved.' : 'Part added.'); onOpenChange(false); }, onError: (e: any) => toast.error(e.message) },
    );
  };

  const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
    <label className={cn('block space-y-1.5', className)}><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="font-condensed text-2xl">{part ? 'Edit part' : 'New part'}</DialogTitle>
          <DialogDescription>{part ? 'Change the details. To change how many are on the shelf, receive a shipment.' : 'Add something to the shelf.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input className="h-11" value={f.name} onChange={set('name')} placeholder="e.g. Oil filter" /></Field>
          <Field label="Part number"><Input className="h-11" value={f.number} onChange={set('number')} /></Field>
          <Field label="Category"><Input className="h-11" value={f.category} onChange={set('category')} placeholder="Filters, Brakes, Fluids…" /></Field>
          <Field label="Unit"><Input className="h-11" value={f.unit} onChange={set('unit')} placeholder="ea, gal, qt" /></Field>
          <Field label="Price each ($)"><Input className="h-11" inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="0.00" /></Field>
          <Field label="Reorder when at or below"><Input className="h-11" inputMode="numeric" value={f.min} onChange={set('min')} /></Field>
          {!part && <Field label="On the shelf now"><Input className="h-11" inputMode="numeric" value={f.qty} onChange={set('qty')} /></Field>}
          <Field label="Vendor"><Input className="h-11" value={f.vendor} onChange={set('vendor')} /></Field>
          <Field label="Reorder link" className="sm:col-span-2"><Input className="h-11" value={f.url} onChange={set('url')} placeholder="https://…" /></Field>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <LoadingButton loading={save.isPending} disabled={save.isPending} onClick={submit} className="h-12 flex-[2] gradient-gold text-primary-foreground">{part ? 'Save' : 'Add the part'}</LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ part, open, onOpenChange }: { part: Part | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const receive = useReceive();
  const [qty, setQty] = useState('');
  const [vendor, setVendor] = useState('');
  const submit = () => {
    const n = Number(qty);
    if (!part || !n || n <= 0) return toast.error('Enter how many came in.');
    receive.mutate({ id: part.id, quantity: n, vendor }, { onSuccess: () => { toast.success(`${n} added to ${part.part_name}.`); setQty(''); setVendor(''); onOpenChange(false); }, onError: (e: any) => toast.error(e.message) });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !receive.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="font-condensed text-2xl">Receive a shipment</DialogTitle>
          <DialogDescription>{part?.part_name}. {Number(part?.quantity_on_hand ?? 0)} on the shelf now.</DialogDescription>
        </DialogHeader>
        <Input autoFocus inputMode="numeric" className="h-16 text-center font-condensed text-4xl" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="How many came in" />
        <Input className="h-11" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" />
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={receive.isPending} disabled={receive.isPending} onClick={submit} className="h-12 flex-[2] gradient-gold text-primary-foreground">Add to the shelf</LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The shelf and the ordering: what is in stock, what is running low, and what just came in. */
export default function ShopPartsPage() {
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useAllPartsInventory();
  const reorder = useRequestReorder();
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState('__all__');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Part | null>(null);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Part | null>(null);

  const parts = (all as Part[]).filter((p) => !p.deleted_at);
  const categories = useMemo(() => Array.from(new Set(parts.map((p) => p.category).filter(Boolean) as string[])).sort(), [parts]);
  const counts = useMemo(() => ({ total: parts.length, low: parts.filter((p) => stockState(p) === 'low').length, out: parts.filter((p) => stockState(p) === 'out').length, value: parts.reduce((s, p) => s + Number(p.quantity_on_hand) * Number(p.unit_cost ?? 0), 0) }), [parts]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts
      .filter((p) => (filter === 'all' || stockState(p) === filter) && (category === '__all__' || p.category === category) && (!q || `${p.part_name} ${p.part_number ?? ''} ${p.vendor_name ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => ({ out: 0, low: 1, ok: 2 })[stockState(a)] - ({ out: 0, low: 1, ok: 2 })[stockState(b)] || a.part_name.localeCompare(b.part_name));
  }, [parts, filter, category, search]);

  return (
    <div>
      <PageHeader title="Parts room">
        <Button className="h-11 gap-2 gradient-gold text-primary-foreground" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New part</Button>
      </PageHeader>
      <ShopNav />

      <StatStrip className="mb-4" cells={[{ label: 'Parts on the shelf', value: counts.total }, { label: 'Running low', value: counts.low, problem: counts.low > 0 }, { label: 'Out of stock', value: counts.out, problem: counts.out > 0 }, { label: 'Shelf value', value: money(counts.value) }]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, number or vendor" className="h-11 pl-9 sm:pl-9" />
        </div>
        <div role="tablist" className="flex rounded-md bg-muted p-1">
          {(['all', 'low', 'out'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('min-h-[40px] rounded-sm px-4 text-sm font-medium capitalize', filter === f ? 'bg-background shadow' : 'text-muted-foreground')}>{f === 'all' ? 'All' : f === 'low' ? 'Low' : 'Out'}</button>
          ))}
        </div>
        {categories.length > 0 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All categories</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : shown.length === 0 ? (
        <ShopEmpty icon={Boxes} title={parts.length === 0 ? 'The shelf is empty' : 'No parts match'}>{parts.length === 0 ? 'Add the parts you keep in stock so mechanics can log them to jobs.' : 'Try a different search or filter.'}</ShopEmpty>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => {
            const state = stockState(p);
            const pct = Math.min(100, Math.round((Number(p.quantity_on_hand) / Math.max(1, Number(p.min_threshold) * 2)) * 100));
            return (
              <li key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3.5')}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium">{p.part_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[p.part_number, p.category, p.vendor_name].filter(Boolean).join(' · ') || 'No details yet'}</p>
                  {p.reorder_requested_at && <p className="mt-0.5 flex items-center gap-1 text-xs text-primary"><ShoppingCart className="h-3 w-3" />Reorder requested</p>}
                </div>
                <div className="w-40 shrink-0">
                  <p className={cn('font-condensed text-3xl font-bold leading-none tabular-nums', state === 'out' ? 'text-red-400' : state === 'low' ? 'text-orange-300' : '')}>
                    {Number(p.quantity_on_hand)} <span className="text-sm font-normal text-muted-foreground">{p.unit}</span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', state === 'out' ? 'bg-red-500' : state === 'low' ? 'bg-orange-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">Reorder at {Number(p.min_threshold)}{p.unit_cost ? ` · ${money(Number(p.unit_cost))} each` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-10 gap-1.5" onClick={() => setReceiving(p)}><Truck className="h-4 w-4" />Receive</Button>
                  {state !== 'ok' && !p.reorder_requested_at && (
                    <Button size="sm" variant="outline" className="h-10 gap-1.5" disabled={reorder.isPending} onClick={() => reorder.mutate(p.id, { onSuccess: () => toast.success('Marked as reorder requested.'), onError: (e: any) => toast.error(e.message) })}><ShoppingCart className="h-4 w-4" />Request reorder</Button>
                  )}
                  {p.reorder_url && <Button asChild size="sm" variant="ghost" className="h-10 w-10 p-0" aria-label="Open the reorder link"><a href={p.reorder_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
                  <Button size="sm" variant="ghost" className="h-10 w-10 p-0" aria-label={`Edit ${p.part_name}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-10 w-10 p-0" aria-label={`Archive ${p.part_name}`} onClick={() => void archiveWithUndo({ table: 'parts_inventory', id: p.id, itemName: p.part_name, queryClient: qc, invalidateKeys: [['all-parts-inventory'], ['low-stock-parts']] })}><Archive className="h-4 w-4" /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PartDialog part={editing} open={!!editing || creating} onOpenChange={(v) => { if (!v) { setEditing(null); setCreating(false); } }} />
      <ReceiveDialog part={receiving} open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)} />
    </div>
  );
}
