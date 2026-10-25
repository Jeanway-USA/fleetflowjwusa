import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName } from '@/hooks/useShop';
import { useManufacturerPMProfiles } from '@/hooks/useMaintenanceData';
import { todayLocal } from '@/lib/datetime';
import { workKindsFor, type TruckSpec } from '@/lib/shop/truckWork';
import { cn } from '@/lib/utils';

const db = supabase as any;

/** One line of service history, as the history page holds it. */
export interface HistoryEntry {
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
  odometer: number | null;
  truck: TruckSpec | null;
}

const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;

/**
 * Fix a line of history: the date, what was done, who did it, what it cost and the notes. A change here moves the
 * truck's service clock, because the planner counts from the latest finished work of each kind.
 */
export function EditHistorySheet({ entry, onOpenChange }: { entry: HistoryEntry | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const me = useMyName();
  const { data: profiles = [] } = useManufacturerPMProfiles();
  const [date, setDate] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [vendor, setVendor] = useState('');
  const [cost, setCost] = useState('');
  const [odo, setOdo] = useState('');
  const [down, setDown] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setDate(entry.date.slice(0, 10));
    setKinds(entry.kinds);
    setVendor(entry.vendor ?? '');
    setCost(entry.cost ? String(entry.cost) : '');
    setOdo(entry.odometer != null ? String(entry.odometer) : '');
    setDown(entry.daysDown != null ? String(entry.daysDown) : '');
    setNotes(entry.notes ?? '');
  }, [entry]);

  const options = useMemo(() => workKindsFor(entry?.truck ?? null, profiles), [entry, profiles]);
  const chips = [...options, ...kinds.filter((k) => !options.some((o) => o.key === k)).map((key) => ({ key, label: key.replace(/_/g, ' '), tasks: [] as string[] }))];
  const toggle = (k: string) => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const save = async () => {
    if (!entry) return;
    if (!date) return toast.error('Choose the date it was done.');
    if (date > todayLocal()) return toast.error('The date cannot be in the future.');
    if (kinds.length === 0 && !notes.trim()) return toast.error('Pick the work, or say what was done.');
    setSaving(true);
    try {
      if (entry.source === 'job') {
        const patch: Record<string, unknown> = {
          service_type: kinds[0] ?? 'repair',
          service_types: kinds.length > 0 ? kinds : ['repair'],
          estimated_completion: date,
          completed_at: new Date(`${date}T12:00:00`).toISOString(),
          vendor: vendor.trim() || null,
          final_cost: num(cost),
          odometer_reading: odo ? num(odo) : null,
          days_down: down === '' ? null : num(down),
          notes: notes.trim() || null,
        };
        // A job cannot start after it was finished.
        if (date < entry.date.slice(0, 10)) patch.entry_date = date;
        const { error } = await db.from('work_orders').update(patch).eq('id', entry.id);
        if (error) throw new Error(error.message);
        await db.from('work_order_events').insert({ org_id: orgId, work_order_id: entry.id, kind: 'status', body: 'Edited from service history', user_name: me });
      } else {
        const { error } = await db
          .from('maintenance_logs')
          .update({ service_date: date, service_type: kinds[0] ?? entry.kinds[0] ?? 'repair', vendor: vendor.trim() || null, cost: num(cost), description: notes.trim() || null })
          .eq('id', entry.id);
        if (error) throw new Error(error.message);
      }
      for (const key of [['shop'], ['pm-schedule'], ['service-history'], ['maintenance-cost-mtd'], ['cost-per-mile'], ['compliance-alerts'], ['trucks'], ['active-work-orders']]) qc.invalidateQueries({ queryKey: key });
      toast.success('History updated.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const Label = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 text-sm font-semibold">{children}</h3>;
  const isJob = entry?.source === 'job';

  return (
    <Sheet open={!!entry} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 mx-0 mt-0 static border-b px-5 pt-5 pb-4 pr-12 text-left">
          <SheetTitle className="font-condensed text-2xl">Edit service history{entry ? `, truck ${entry.unit}` : ''}</SheetTitle>
          <SheetDescription>Correct a date, the work, the cost or the notes. The truck's next-service countdown follows the change.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div><Label>Date it was done</Label><Input type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} className="h-12" /></div>
            <div><Label>Total cost</Label><Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="h-12" /></div>
          </section>

          <section>
            <Label>What was done?</Label>
            <div className="flex flex-wrap gap-2">
              {chips.map((k) => (
                <button key={k.key} type="button" onClick={() => toggle(k.key)} className={cn('min-h-[44px] rounded-md border px-4 text-sm font-medium', kinds.includes(k.key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{k.label}</button>
              ))}
            </div>
            {!isJob && <p className="mt-1.5 text-xs text-muted-foreground">This is an older log entry, so it keeps one kind of work. The first one you pick is used.</p>}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div><Label>Who did it? <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Me, or the shop's name" className="h-12" /></div>
            {isJob && <div><Label>Odometer <span className="font-normal text-muted-foreground">(optional)</span></Label><Input inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Miles at the time" className="h-12" /></div>}
          </section>

          {isJob && <div><Label>Days the truck was down <span className="font-normal text-muted-foreground">(optional)</span></Label><Input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} className="h-12 sm:max-w-[200px]" /></div>}

          <section>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What was replaced, what was found, anything worth remembering" />
          </section>
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <LoadingButton loading={saving} disabled={saving} onClick={save} className="h-12 flex-[2] bg-primary text-primary-foreground hover:bg-primary/90">Save changes</LoadingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
