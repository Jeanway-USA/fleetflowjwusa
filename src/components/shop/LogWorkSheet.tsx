import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ImagePlus, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName } from '@/hooks/useShop';
import { todayLocal } from '@/lib/datetime';
import { findDuplicate, logCompletedWork, validateLog } from '@/lib/shop/log-work';
import { WORK_KINDS } from '@/lib/shop/templates';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  truckId?: string | null;
}

const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;

/**
 * Put work that is already finished into a truck's history: an oil change done last week, a vendor's repair, a
 * tire swap from last spring. It goes straight into the log, resets the service interval it covers, and keeps
 * the receipt. It never touches the open-jobs board.
 */
export function LogWorkSheet({ open, onOpenChange, truckId }: Props) {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const me = useMyName();
  const [truck, setTruck] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [kinds, setKinds] = useState<string[]>([]);
  const [what, setWhat] = useState('');
  const [doneBy, setDoneBy] = useState('');
  const [cost, setCost] = useState('');
  const [odo, setOdo] = useState('');
  const [receipts, setReceipts] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<{ id: string; title: string } | null>(null);

  const { data: trucks = [] } = useQuery({
    queryKey: ['shop', 'trucks-for-log'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('trucks').select('id, unit_number, make, model, current_odometer').is('deleted_at', null).order('unit_number');
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setDate(todayLocal());
    setKinds([]);
    setWhat('');
    setDoneBy('');
    setCost('');
    setOdo('');
    setReceipts([]);
    setDupe(null);
    setTruck(truckId ?? null);
  }, [open, truckId]);

  // With a single truck there is nothing to choose.
  useEffect(() => {
    if (open && !truck && trucks.length === 1) setTruck(trucks[0].id);
  }, [open, truck, trucks]);

  const toggle = (k: string) => {
    setDupe(null);
    setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const save = async (force: boolean) => {
    const input = { orgId: orgId ?? '', userName: me, truckId: truck ?? '', date, kinds, title: WORK_KINDS.filter((k) => kinds.includes(k.key)).map((k) => k.label).join(' + '), description: what, doneBy, cost: num(cost), odometer: odo ? num(odo) : null, receipts };
    const problem = validateLog(input);
    if (problem) return toast.error(problem);
    if (!orgId) return toast.error('Your organization has not finished loading.');
    setSaving(true);
    try {
      if (!force) {
        const hit = await findDuplicate(input.truckId, date, kinds);
        if (hit) {
          setDupe(hit);
          return;
        }
      }
      const id = await logCompletedWork(input);
      for (const key of [['shop'], ['pm-schedule'], ['service-history'], ['maintenance-cost-mtd'], ['cost-per-mile'], ['compliance-alerts'], ['trucks'], ['active-work-orders']]) qc.invalidateQueries({ queryKey: key });
      toast.success('Added to the truck\'s history.', { action: { label: 'View', onClick: () => window.location.assign(`/shop/jobs/${id}`) } });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const Label = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 text-sm font-semibold">{children}</h3>;

  return (
    <Sheet open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="font-condensed text-2xl">Log work already done</SheetTitle>
          <SheetDescription>For work that is finished: yours, a vendor's, or from before you used the app. It goes into the truck's history and resets the service it covers.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {trucks.length !== 1 && (
            <section>
              <Label>Which truck?</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {trucks.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTruck(t.id)} className={cn('min-h-[60px] rounded-lg border p-3 text-left', truck === t.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent')}>
                    <span className="block font-condensed text-xl font-bold leading-none">{t.unit_number}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[t.make, t.model].filter(Boolean).join(' ')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {trucks.length === 1 && <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm">Truck <strong>{trucks[0].unit_number}</strong> {[trucks[0].make, trucks[0].model].filter(Boolean).join(' ')}</p>}

          <section className="grid gap-3 sm:grid-cols-2">
            <div><Label>Date it was done</Label><Input type="date" max={todayLocal()} value={date} onChange={(e) => { setDate(e.target.value); setDupe(null); }} className="h-12" /></div>
            <div><Label>Odometer <span className="font-normal text-muted-foreground">(optional)</span></Label><Input inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Miles at the time" className="h-12" /></div>
          </section>

          <section>
            <Label>What was done?</Label>
            <div className="mb-2 flex flex-wrap gap-2">
              {WORK_KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => toggle(k.key)} className={cn('min-h-[44px] rounded-md border px-4 text-sm font-medium', kinds.includes(k.key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{k.label}</button>
              ))}
            </div>
            <Textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} placeholder="Details: what was replaced, what was found, anything worth remembering" />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div><Label>Who did it? <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Me, or the shop's name" className="h-12" /></div>
            <div><Label>Total cost</Label><Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="h-12" /></div>
          </section>

          <section>
            <Label>Receipt or photos <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium hover:bg-accent">
              <ImagePlus className="h-5 w-5" />Add a photo or scan
              <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => { setReceipts((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
            {receipts.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {receipts.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{f.name}</span><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setReceipts(receipts.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground" /></button></li>
                ))}
              </ul>
            )}
          </section>

          {dupe && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning">This may already be logged</p>
              <p className="mt-0.5 text-muted-foreground">There is already a finished job on this truck for {date}: <Link className="text-primary underline" to={`/shop/jobs/${dupe.id}`}>{dupe.title}</Link>. Save it anyway only if it is a different job.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <LoadingButton loading={saving} disabled={saving} onClick={() => save(!!dupe)} className="h-12 flex-[2] bg-primary text-primary-foreground hover:bg-primary/90">{dupe ? 'Save it anyway' : 'Add to history'}</LoadingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
