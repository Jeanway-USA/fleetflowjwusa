import { useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { readSettlementLines } from '@/lib/read-settlement-lines';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { expenseForMissingLine, loadForMissingTrip, proveTrips, type LineGap, type ProofResult, type TripProof } from '@/lib/weekly-proof';
import { settingsFrom } from '@/components/finance/TrueUpLoads';
import type { SettlementLine } from '@/lib/settlement-trueup';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Roster, type RosterEntry } from '@/components/fleet/Roster';

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));

function issueText(t: TripProof): string[] {
  const out: string[] = [];
  if (t.issues.includes('missing_load')) out.push('Landstar settled it but it is not in your loads.');
  if (t.issues.includes('revenue')) out.push(`Revenue: Landstar ${money(t.landstar.revenue)}, your load ${money(t.app.revenue)}. Run the match above.`);
  const describe = (label: string, l: number, a: number, gap: LineGap) => {
    const lines = (rows: Array<{ description: string; amount: number; date?: string | null }>) =>
      rows.map((r) => `${r.description.trim()} ${money(r.amount)}${r.date ? ` (${format(parseISO(r.date), 'MMM d')})` : ''}`).join('; ');
    const parts = [`${label}: Landstar ${money(l)}, you have ${money(a)}.`];
    if (gap.surplus.length > 0) parts.push(`Not in Landstar's file: ${lines(gap.surplus)}.`);
    if (gap.missing.length > 0) parts.push(`Missing from the app: ${lines(gap.missing)}.`);
    return parts.join(' ');
  };
  if (t.issues.includes('charges')) out.push(describe('Charges', t.landstar.charges, t.app.charges, t.gaps.charges));
  if (t.issues.includes('advances')) out.push(describe('Advances', t.landstar.advances, t.app.advances, t.gaps.advances));
  return out;
}

/** Your lines Landstar has no partner for: the ones to review as duplicates. */
function surplusIds(t: TripProof): string[] {
  return [...t.gaps.charges.surplus, ...t.gaps.advances.surplus].map((l) => l.id).filter((id): id is string => !!id);
}

interface WeeklyProofProps {
  /** The pay rates, to work out your share of a trip that has to be added as a load. */
  getSetting: (key: string, defaultValue?: string) => string;
  /** Tick expense rows in the Expenses tab; archiving them stays a deliberate step there. */
  onTick?: (ids: string[]) => void;
}

export function WeeklyProof({ onTick, getSetting }: WeeklyProofProps) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ProofResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<SettlementLine[] | null>(null);
  const [trucks, setTrucks] = useState<Map<string, string | null>>(new Map());
  const [truckByUnit, setTruckByUnit] = useState<Map<string, string>>(new Map());
  const { orgId } = useAuth();

  /** Reads your loads and expenses fresh and checks them against Landstar's lines. */
  const check = async (settlementLines: SettlementLine[]) => {
    const [{ data: loads, error: loadsError }, { data: expenses, error: expensesError }] = await Promise.all([
      supabase.from('fleet_loads').select('id, landstar_load_id, net_revenue, truck_id').is('deleted_at', null),
      supabase.from('expenses').select('id, expense_date, load_id, expense_type, amount, description, notes').is('deleted_at', null).not('load_id', 'is', null).limit(10000),
    ]);
    if (loadsError) throw loadsError;
    if (expensesError) throw expensesError;
    const { data: truckRows } = await supabase.from('trucks').select('id, unit_number').is('deleted_at', null);
    setTruckByUnit(new Map((truckRows ?? []).map((t: any) => [String(t.unit_number), t.id as string])));
    setTrucks(new Map((loads ?? []).map((l: any) => [l.id, l.truck_id ?? null])));
    setResult(proveTrips(settlementLines, (loads ?? []) as any[], (expenses ?? []) as any[]));
  };

  const recheck = async () => {
    if (!lines) return;
    setBusy(true);
    try {
      await check(lines);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not check again');
    } finally {
      setBusy(false);
    }
  };

  /** Adds the Landstar lines the app is missing for one trip, linked to its load. */
  const addMissing = async (t: TripProof) => {
    if (!orgId || !t.loadId) return;
    const rows = [
      ...t.gaps.charges.missing.map((m) => expenseForMissingLine(m, 'charge')),
      ...t.gaps.advances.missing.map((m) => expenseForMissingLine(m, 'advance')),
    ].map((r) => ({
      ...r,
      org_id: orgId,
      load_id: t.loadId,
      truck_id: trucks.get(t.loadId!) ?? null,
      expense_date: t.pickup ?? t.week ?? new Date().toISOString().slice(0, 10),
    }));
    setBusy(true);
    try {
      const { error } = await supabase.from('expenses').insert(rows as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(`Added ${rows.length} ${rows.length === 1 ? 'line' : 'lines'} to trip ${t.trip}`);
      if (lines) await check(lines);
    } catch (err: any) {
      toast.error(`Could not add the lines: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Adds a settled trip as a delivered load, with its settled accessorials. Its charges and advances come next, from the buttons that follow. */
  const addLoad = async (t: TripProof) => {
    const built = loadForMissingTrip(t, settingsFrom(getSetting), truckByUnit);
    if (!built || !orgId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('fleet_loads').insert({ ...built.load, org_id: orgId } as any).select('id').single();
      if (error) throw error;
      if (built.accessorials.length > 0) {
        const { error: accError } = await supabase.from('load_accessorials').insert(built.accessorials.map((a) => ({ ...a, load_id: data.id, org_id: orgId })) as any);
        if (accError) throw accError;
      }
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
      toast.success(`Added load ${t.trip}. Check its driver, then add its charges and advances here.`);
      if (lines) await check(lines);
    } catch (err: any) {
      toast.error(`Could not add the load: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const parsed = await readSettlementLines(await file.arrayBuffer());
      if (parsed.length === 0) throw new Error('No settlement lines were found in that file.');
      setLines(parsed);
      await check(parsed);
      setFileName(file.name);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not read that file');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const entries: RosterEntry[] = (result?.weeks ?? []).map((w) => {
    const fact = (label: string, l: number, a: number) => ({
      label,
      value: Math.abs(l - a) < 0.005 ? money(l) : `${money(l)} vs ${money(a)}`,
      tone: Math.abs(l - a) < 0.005 ? undefined : ('bad' as const),
    });
    return {
      id: w.week,
      title: w.week === 'undated' ? 'No settlement date' : `Settled ${format(parseISO(w.week), 'EEE, MMM d')}`,
      chips: (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${w.proven ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
          {w.proven ? 'Proven' : 'To check'}
        </span>
      ),
      subtitle: (
        <>
          {w.trips} {w.trips === 1 ? 'trip' : 'trips'}.{' '}
          {w.proven ? 'Everything agrees with Landstar.' : `${w.open.length} to check.`}
          {w.open.length > 0 && (
            <ul className="mt-1 space-y-1 text-foreground">
              {w.open.map((t) => (
                <li key={t.trip}>
                  <span className="font-medium tabular-nums">Trip {t.trip}</span>
                  {issueText(t).map((line) => <span key={line} className="block text-[13px] text-muted-foreground">{line}</span>)}
                  {!t.loadFound && t.settledTrip?.hasLinehaul && (
                    <Button variant="outline" className="mr-2 mt-1 h-11" disabled={busy} onClick={() => addLoad(t)}>
                      Add this load ({money(t.landstar.revenue)})
                    </Button>
                  )}
                  {t.loadId && t.gaps.charges.missing.length + t.gaps.advances.missing.length > 0 && (
                    <Button variant="outline" className="mr-2 mt-1 h-11" disabled={busy} onClick={() => addMissing(t)}>
                      Add {t.gaps.charges.missing.length + t.gaps.advances.missing.length} missing {t.gaps.charges.missing.length + t.gaps.advances.missing.length === 1 ? 'line' : 'lines'}
                    </Button>
                  )}
                  {onTick && surplusIds(t).length > 0 && (
                    <Button
                      variant="outline"
                      className="mt-1 h-11"
                      onClick={() => {
                        onTick(surplusIds(t));
                        toast.success(`Ticked ${surplusIds(t).length} ${surplusIds(t).length === 1 ? 'line' : 'lines'} in Expenses. Review them there before archiving.`);
                      }}
                    >
                      Tick {surplusIds(t).length} in Expenses
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
      facts: [
        fact('Revenue', w.landstar.revenue, w.app.revenue),
        fact('Charges', w.landstar.charges, w.app.charges),
        fact('Advances', w.landstar.advances, w.app.advances),
      ],
    };
  });

  return (
    <Panel
      title="Weekly proof against Landstar"
      description="Checks every trip in Landstar's Freight Bill Details export against your loads and imported charges, week by week. A week is proven when it agrees to the cent."
      flush
      aside={
        <>
          <input ref={fileInput} type="file" accept=".xlsx,.xls" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" className="h-11 gap-2" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {result ? 'Choose another file' : 'Choose Freight Bill Details file'}
          </Button>
          {result && (
            <Button variant="outline" className="h-11" onClick={recheck} disabled={busy}>Check again</Button>
          )}
        </>
      }
    >
      {!result ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          Choose the Freight Bill Details file from Landstar. Use the year-to-date export to prove every week so far, or the weekly export each Wednesday.
        </p>
      ) : (
        <>
          <div className="border-t px-4">
            <StatementLine label="From" note={`${result.trips.length} trips in the file`} value={<span className="text-base font-medium">{fileName}</span>} muted />
            <StatementLine label="Trips that agree with Landstar" value={result.provenTrips} rule="single" tone="good" />
            <StatementLine
              label={result.openTrips === 0 ? 'Every trip is proven' : 'Trips to check'}
              note={result.openTrips === 0 ? 'Revenue, charges and advances all agree to the cent.' : 'See the weeks marked below.'}
              value={result.openTrips}
              strong
              rule="double"
              tone={result.openTrips === 0 ? 'good' : 'bad'}
            />
          </div>
          <Roster entries={entries} bordered={false} empty="No settled trips in this file." />
        </>
      )}
    </Panel>
  );
}
