import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/formatters';
import type { RevenueSettings } from '@/lib/revenue-calculator';
import { readSettlementLines } from '@/lib/read-settlement-lines';
import { planTrueUp, settleTrips, type SettledTrip, type TrueUpPlan } from '@/lib/settlement-trueup';
import { Panel, StatementLine } from '@/components/finance/statement-ui';

interface TrueUpLoadsProps {
  getSetting: (key: string, defaultValue?: string) => string;
}

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));
const day = (d: string | null) => (d ? format(parseISO(d), 'MMM d') : '');

export function settingsFrom(getSetting: TrueUpLoadsProps['getSetting']): RevenueSettings {
  return {
    truckPct: (parseFloat(getSetting('truck_percentage', '65')) || 0) / 100,
    trailerPct: (parseFloat(getSetting('trailer_percentage', '7')) || 0) / 100,
    advancePct: (parseFloat(getSetting('advance_percentage', '30')) || 0) / 100,
    ownsTrailer: getSetting('owns_trailer', 'false') === 'true',
    powerOnlyPct: (parseFloat(getSetting('power_only_percentage', '70')) || 0) / 100,
  };
}

export function TrueUpLoads({ getSetting }: TrueUpLoadsProps) {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [trips, setTrips] = useState<SettledTrip[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<TrueUpPlan | null>(null);
  const [busy, setBusy] = useState<'reading' | 'applying' | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const check = async (settled: SettledTrip[]) => {
    const [{ data: loads, error: loadsError }, { data: rows, error: rowsError }] = await Promise.all([
      supabase.from('fleet_loads').select('*').is('deleted_at', null),
      supabase.from('load_accessorials').select('id, load_id, accessorial_type, amount, percentage').is('deleted_at', null),
    ]);
    if (loadsError) throw loadsError;
    if (rowsError) throw rowsError;
    setPlan(planTrueUp(settled, (loads ?? []) as any[], (rows ?? []) as any[], settingsFrom(getSetting)));
    setSkipped(new Set());
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('reading');
    setPlan(null);
    try {
      const settled = settleTrips(await readSettlementLines(await file.arrayBuffer()));
      if (settled.length === 0) throw new Error('No settlement lines were found in that file.');
      setTrips(settled);
      setFileName(file.name);
      await check(settled);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not read that file');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggle = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosenChanges = plan?.changes.filter((c) => !skipped.has(c.id)) ?? [];
  const chosenRenames = plan?.renames.filter((r) => !skipped.has(r.id)) ?? [];
  const chosenCount = chosenChanges.length + chosenRenames.length;
  const chosenChange = chosenChanges.reduce((s, c) => s + (c.after - c.before), 0);

  const apply = async () => {
    if (!plan || chosenCount === 0) return;
    setBusy('applying');
    let failed = 0;
    try {
      for (const r of chosenRenames) {
        const { error } = await supabase.from('fleet_loads').update({ landstar_load_id: r.to }).eq('id', r.id);
        if (error) failed++;
      }
      for (const change of chosenChanges) {
        const { error } = await supabase.from('fleet_loads').update(change.patch).eq('id', change.id);
        if (error) { failed++; continue; }
        for (const op of change.ops) {
          const result =
            op.kind === 'update'
              ? await supabase.from('load_accessorials').update({ amount: op.amount, percentage: op.percentage }).eq('id', op.id)
              : await supabase.from('load_accessorials').insert({
                  load_id: op.load_id,
                  accessorial_type: op.type,
                  amount: op.amount,
                  percentage: op.percentage,
                  org_id: orgId,
                } as any);
          if (result.error) failed++;
        }
      }
      if (failed > 0) toast.error(`${failed} update${failed === 1 ? '' : 's'} did not save. Check again to see what is left.`);
      else toast.success(`Updated ${chosenCount} ${chosenCount === 1 ? 'load' : 'loads'} to match Landstar`);
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      queryClient.invalidateQueries({ queryKey: ['load_accessorials'] });
      if (trips) await check(trips);
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const nothingToDo = plan && plan.changes.length === 0 && plan.renames.length === 0;

  return (
    <Panel
      title="Match your loads to Landstar's settlement"
      description="A load starts as an estimate from the freight bill, before Landstar's cut. Landstar's Freight Bill Details export lists what they actually paid, so this brings each load in line with it."
      aside={
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button variant="outline" className="h-11 gap-2" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            {busy === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {plan ? 'Choose another file' : 'Choose Freight Bill Details file'}
          </Button>
        </>
      }
    >
      {!plan ? (
        <p className="border-t py-3 text-sm text-muted-foreground">
          Choose the Freight Bill Details file from Landstar, either the week's export or the year to date. You will see every change before anything is saved.
        </p>
      ) : (
        <>
          <div className="border-t">
            <StatementLine label="From" note={`${trips?.length ?? 0} trips in the file`} value={<span className="text-base font-medium">{fileName}</span>} muted />
            <StatementLine label="Loads that will change" note="Rate, fuel surcharge or accessorials differ from what Landstar paid" value={plan.changes.length} />
            <StatementLine label="Loads that already match" value={plan.unchanged} />
            <StatementLine
              label="Your revenue changes by"
              note={chosenCount === plan.changes.length + plan.renames.length ? 'If every load below is updated' : 'For the loads ticked below'}
              value={money(chosenChange)}
              strong
              rule="double"
            />
          </div>

          {nothingToDo && (
            <p className="border-t py-3 text-sm text-muted-foreground">Every load in this file already matches what Landstar paid.</p>
          )}

          {plan.renames.length > 0 && (
            <section className="border-t">
              <h4 className="pt-3 font-condensed text-lg font-bold">Trip numbers that look mistyped</h4>
              <ul className="divide-y">
                {plan.renames.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-2.5">
                    <Checkbox id={`tu-${r.id}`} className="mt-1" checked={!skipped.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    <label htmlFor={`tu-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <div className="text-[15px] font-medium">Change trip {r.from} to {r.to}</div>
                      <div className="text-[13px] text-muted-foreground">Landstar settled {money(r.total)} for {r.to}, the same as this load, and no load has that number.</div>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.changes.length > 0 && (
            <section className="border-t">
              <div className="flex items-center justify-between gap-2 pt-3">
                <h4 className="font-condensed text-lg font-bold">Loads to update ({plan.changes.length})</h4>
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => setSkipped(skipped.size === 0 ? new Set(plan.changes.map((c) => c.id).concat(plan.renames.map((r) => r.id))) : new Set())}
                >
                  {skipped.size === 0 ? 'Untick all' : 'Tick all'}
                </Button>
              </div>
              <ul className="divide-y">
                {plan.changes.map((c) => {
                  const delta = c.after - c.before;
                  return (
                    <li key={c.id} className="flex items-start gap-3 py-2.5">
                      <Checkbox id={`tu-${c.id}`} className="mt-1" checked={!skipped.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                      <label htmlFor={`tu-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <div className="flex items-baseline gap-2">
                          <span className="font-condensed text-lg font-bold leading-tight">{c.trip}</span>
                          <span className="figure ml-auto text-base font-semibold">{money(c.before)} to {money(c.after)}</span>
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {c.notes.length > 0 ? c.notes.join('. ') : 'Revenue recalculated'}
                        </div>
                        <div className={`figure text-[13px] ${delta < 0 ? 'text-destructive' : 'text-success'}`}>{delta > 0 ? '+' : ''}{money(delta)}</div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {plan.missing.length > 0 && (
            <section className="border-t">
              <h4 className="pt-3 font-condensed text-lg font-bold">Settled by Landstar but not in your loads ({plan.missing.length})</h4>
              <p className="text-[13px] text-muted-foreground">Add these loads, then check again and they will be matched.</p>
              <ul className="divide-y">
                {plan.missing.map((m) => (
                  <li key={m.trip} className="flex items-baseline gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium tabular-nums">{m.trip}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{[day(m.delivery), m.lane].filter(Boolean).join(', ')}</span>
                    </span>
                    <span className="figure text-base font-semibold">{money(m.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.unsettled.length > 0 && (
            <section className="border-t">
              <h4 className="pt-3 font-condensed text-lg font-bold">Delivered, but Landstar has not settled them ({plan.unsettled.length})</h4>
              <p className="text-[13px] text-muted-foreground">These fall inside the dates of this file and are not in it. Check the trip number, or whether payment is still pending.</p>
              <ul className="divide-y">
                {plan.unsettled.map((u) => (
                  <li key={u.id} className="flex items-baseline gap-2 py-2">
                    <span className="font-medium tabular-nums">{u.trip}</span>
                    <span className="ml-auto text-[13px] text-muted-foreground">Delivered {day(u.delivery)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(plan.partial.length > 0 || plan.adjustments.length > 0) && (
            <section className="border-t py-3">
              {plan.partial.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  Left alone: {plan.partial.length} {plan.partial.length === 1 ? 'load' : 'loads'} where this file shows only part of the trip ({plan.partial.join(', ')}). Use the year-to-date file to update those.
                </p>
              )}
              {plan.adjustments.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  Adjustments to loads settled before this file: {plan.adjustments.map((a) => `${a.trip} (${money(a.total)})`).join(', ')}.
                </p>
              )}
            </section>
          )}

          {plan.changes.length + plan.renames.length > 0 && (
            <div className="sticky bottom-16 -mx-4 flex items-center justify-between gap-3 border-t bg-card px-4 py-3 md:bottom-0">
              <span className="text-sm text-muted-foreground">{chosenCount} selected</span>
              <Button className="h-11" onClick={apply} disabled={busy !== null || chosenCount === 0}>
                {busy === 'applying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update {chosenCount} {chosenCount === 1 ? 'load' : 'loads'}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
