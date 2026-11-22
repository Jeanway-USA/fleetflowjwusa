import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileSearch, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { IntermediateStopsView } from '@/components/loads/IntermediateStopsView';
import { StatusHistoryLog } from '@/components/loads/StatusHistoryLog';
import { PODViewer } from '@/components/loads/PODViewer';
import { useLoadDiscrepancies } from '@/hooks/useSettlementDiscrepancies';
import { useSettlementWeekSetting } from '@/hooks/useSettlementWeekSetting';
import { calculateRevenue, roundCents } from '@/lib/revenue-calculator';
import { accessorialShare } from '@/lib/accessorials';
import { revenueSettingsFrom } from '@/lib/rate-con-review';
import { deliveryWeekEnd, loadProofStatus, proveWeekPath, type LoadProofState } from '@/lib/load-proof';
import { readSettlementLines } from '@/lib/read-settlement-lines';
import { proveTrips, type TripProof } from '@/lib/weekly-proof';
import { fetchProofInputs } from '@/lib/proof-inputs';
import { cityState } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const usd = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const dayText = (d: string | null | undefined) => {
  if (!d) return 'Not set';
  try { return format(parseISO(d), 'EEE, MMM d, yyyy'); } catch { return d; }
};

const timeText = (time: string | null | undefined, end: string | null | undefined, tz: string | null | undefined) => {
  if (!time) return null;
  const t = time.slice(0, 5);
  return `${t}${end ? ` to ${end.slice(0, 5)}` : ''}${tz ? ` (${tz.replace('America/', '').replace(/_/g, ' ')})` : ''}`;
};

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-t px-4 py-4 sm:px-6', className)}>
      <h3 className="mb-3 font-condensed text-xl font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, strong, muted, note }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className={cn('text-[15px]', strong && 'font-semibold', muted && 'text-muted-foreground')}>{label}</p>
        {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
      </div>
      <p className={cn('figure shrink-0 text-right tabular-nums', strong ? 'text-2xl font-bold' : 'text-lg font-semibold', muted && 'text-muted-foreground')}>{value}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="break-words text-[15px] font-medium">{children}</p>
    </div>
  );
}

const PROOF_TONE: Record<LoadProofState, string> = {
  proven: 'border-success/50 bg-success/5',
  open: 'border-destructive/50 bg-destructive/5',
  resolved: 'border-border bg-muted/30',
  not_delivered: 'border-border bg-muted/30',
  not_proved: 'border-warning/50 bg-warning/5',
};

interface LoadDetailSheetProps {
  load: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string | null;
  truckUnit: string | null;
  trailerNumber: string | null;
  onEdit: (load: any) => void;
}

/**
 * One place to read a Landstar load: who and where, the schedule and stops, the money the way Landstar pays it, and
 * whether the trip has been proven against Landstar's own statement. Editing stays in the existing load form.
 */
export function LoadDetailSheet({ load, open, onOpenChange, driverName, truckUnit, trailerNumber, onEdit }: LoadDetailSheetProps) {
  const { endDay } = useSettlementWeekSetting();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ found: boolean; trip: TripProof | null } | null>(null);
  const loadId: string | undefined = load?.id;

  const { data: accessorials = [] } = useQuery({
    queryKey: ['load_accessorials', 'detail', loadId],
    enabled: open && !!loadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('load_accessorials').select('accessorial_type, amount, percentage, notes').eq('load_id', loadId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settingRows = [] } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*');
      if (error) throw error;
      return data;
    },
  });
  const settings = useMemo(() => revenueSettingsFrom(settingRows as any[]), [settingRows]);
  const { data: discrepancies = [] } = useLoadDiscrepancies(open ? loadId : null);

  const money = useMemo(() => {
    if (!load) return null;
    const rate = Number(load.rate) || 0;
    const fsc = Number(load.fuel_surcharge) || 0;
    const accTotal = roundCents(accessorials.reduce((s: number, a: any) => s + accessorialShare(a), 0));
    const accListed = roundCents(accessorials.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0));
    const calc = calculateRevenue(
      { rate, fuel_surcharge: fsc, lumper: Number(load.lumper) || 0, advance_taken: Number(load.advance_taken) || 0, is_power_only: !!load.is_power_only, accessorialsTotal: accTotal },
      settings,
    );
    const share = load.is_power_only ? settings.powerOnlyPctDisplay : settings.truckPctDisplay;
    const stored = load.net_revenue != null ? Number(load.net_revenue) : null;
    return {
      rate, fsc, accTotal, accListed, share,
      linehaulShare: roundCents(rate * (share / 100)),
      gross: load.gross_revenue != null ? Number(load.gross_revenue) : roundCents(rate + fsc + accListed),
      net: stored ?? calc.net_revenue,
      recomputed: calc.net_revenue,
      differs: stored != null && Math.abs(stored - calc.net_revenue) > 0.01,
    };
  }, [load, accessorials, settings]);

  const status = useMemo(
    () => loadProofStatus({ status: load?.status ?? null, discrepancies, hasStatementDiscrepancy: !!load?.has_statement_discrepancy, checked }),
    [load, discrepancies, checked],
  );

  if (!load || !money) return null;

  const tripId: string = load.landstar_load_id || `#${String(load.id).slice(0, 8)}`;
  const weekEnd = deliveryWeekEnd(load.delivery_date, endDay);

  const checkAgainstFile = async (file: File) => {
    setChecking(true);
    try {
      const lines = await readSettlementLines(await file.arrayBuffer());
      const { loads, expenses } = await fetchProofInputs();
      const proof = proveTrips(lines, loads, expenses);
      const trip = proof.trips.find((t) => t.trip === String(load.landstar_load_id)) ?? null;
      setChecked({ found: !!trip, trip });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setChecking(false);
    }
  };

  const hasPod = !!(load.pod_signature_path || load.pod_transflo_link);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setChecked(null); onOpenChange(o); }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {/* Identity: trip, agent, status, lane, and the net, readable without scrolling */}
        <SheetHeader className="space-y-2 px-4 pb-4 pt-5 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle className="font-condensed text-3xl font-bold tabular-nums">Trip {tripId}</SheetTitle>
            <StatusBadge status={load.status} />
          </div>
          <SheetDescription className="text-[15px] text-foreground">
            {cityState(load.origin) || load.origin} <ArrowRight className="mx-1 inline h-4 w-4 align-[-2px]" /> {cityState(load.destination) || load.destination}
          </SheetDescription>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
            <Fact label="Agent code">{load.agency_code || 'Not set'}</Fact>
            <Fact label="Driver">{driverName || 'Not assigned'}</Fact>
            <Fact label="Truck">{truckUnit || 'Not assigned'}</Fact>
            <Fact label="Trailer">{trailerNumber || 'Not assigned'}</Fact>
          </div>
          <div className="flex items-end justify-between gap-3 rounded-lg border bg-card px-3 py-2">
            <div>
              <p className="text-[13px] text-muted-foreground">{load.net_revenue != null ? 'Net to the truck' : 'Estimated net to the truck'}</p>
              <p className="figure text-4xl font-bold leading-none tabular-nums">{usd(money.net)}</p>
            </div>
            <Button className="h-12 sm:h-10" onClick={() => onEdit(load)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit load
            </Button>
          </div>
        </SheetHeader>

        <Section title="Settlement proof">
          <div className={cn('rounded-lg border p-3', PROOF_TONE[status.state])}>
            <p className="flex items-start gap-2 text-[15px] font-semibold">
              {status.state === 'proven' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                : status.state === 'open' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                : status.state === 'not_proved' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                : <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
              {status.headline}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{status.note}</p>
            {status.issues.length > 0 && (
              <ul className="mt-2 space-y-2">
                {status.issues.map((i) => (
                  <li key={`${i.title}-${i.detail}`} className="text-[15px]">
                    <span className="font-medium">{i.title}.</span> {i.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {load.landstar_load_id && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void checkAgainstFile(f); e.target.value = ''; }}
                />
                <Button variant="outline" className="h-12 sm:h-10" disabled={checking} onClick={() => fileRef.current?.click()}>
                  {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                  Check this trip against a Freight Bill file
                </Button>
              </>
            )}
            {status.state !== 'not_delivered' && (
              <Button asChild variant={status.state === 'open' || status.state === 'not_proved' ? 'default' : 'outline'} className="h-12 sm:h-10">
                <Link to={proveWeekPath(weekEnd)} onClick={() => onOpenChange(false)}>
                  Prove {weekEnd ? `the week ending ${format(parseISO(weekEnd), 'MMM d')}` : 'this week'} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </Section>

        <Section title="Money">
          <Row label="Linehaul" value={usd(money.rate)} />
          <Row label={`Your share of linehaul (${money.share}%)`} value={usd(money.linehaulShare)} muted note={`Landstar keeps ${usd(roundCents(money.rate - money.linehaulShare))} of linehaul`} />
          <Row label="Fuel surcharge" value={usd(money.fsc)} note="Paid 100% to you" />
          {accessorials.map((a: any, i: number) => {
            const paid = accessorialShare(a);
            const listed = Number(a.amount) || 0;
            return (
              <Row
                key={`${a.accessorial_type}-${i}`}
                label={a.accessorial_type}
                value={usd(paid)}
                note={paid !== listed ? `${usd(listed)} listed, ${a.percentage}% paid${a.notes ? `. ${a.notes}` : ''}` : a.notes || undefined}
              />
            );
          })}
          {Number(load.lumper) > 0 && <Row label="Lumper" value={usd(load.lumper)} muted note="Reimbursed in full by Landstar; it does not change your net" />}
          <Row label="Billed in all" value={usd(money.gross)} muted />
          <div className="mt-1 border-t pt-2">
            <Row label={load.net_revenue != null ? 'Net to the truck' : 'Estimated net to the truck'} value={usd(money.net)} strong />
          </div>
          {money.differs && (
            <p className="mt-1 text-[13px] text-warning">
              Today's pay settings would work this out to {usd(money.recomputed)}. The saved figure above is what the load was saved with.
            </p>
          )}
          <p className="mt-2 text-[13px] text-muted-foreground">
            Advances, fuel card charges and other deductions come off at settlement, not on the rate confirmation. Open the Edit form's Money tab to change a figure.
          </p>
        </Section>

        <Section title="Schedule and stops">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Pickup">
              {dayText(load.pickup_date)}
              {timeText(load.pickup_time, load.pickup_end_time, load.pickup_tz) && <span className="block text-[13px] font-normal text-muted-foreground">{timeText(load.pickup_time, load.pickup_end_time, load.pickup_tz)}</span>}
            </Fact>
            <Fact label="Delivery">
              {dayText(load.delivery_date)}
              {timeText(load.delivery_time, load.delivery_end_time, load.delivery_tz) && <span className="block text-[13px] font-normal text-muted-foreground">{timeText(load.delivery_time, load.delivery_end_time, load.delivery_tz)}</span>}
            </Fact>
            <Fact label="Pickup address">{load.origin || 'Not set'}</Fact>
            <Fact label="Delivery address">{load.destination || 'Not set'}</Fact>
            <Fact label="Pickup number">{load.pickup_number || 'Not on file'}</Fact>
            <Fact label="Miles">{(load.actual_miles || load.booked_miles || 0).toLocaleString()}{load.actual_miles ? ' driven' : ' booked'}</Fact>
          </div>
          <div className="mt-3">
            <IntermediateStopsView loadId={load.id} />
          </div>
          {load.notes && (
            <div className="mt-3">
              <p className="text-[13px] text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[15px]">{load.notes}</p>
            </div>
          )}
        </Section>

        <Section title="Activity">
          <StatusHistoryLog
            loadId={load.id}
            pickupDate={load.pickup_date}
            pickupTime={load.pickup_time}
            deliveryDate={load.delivery_date}
            deliveryTime={load.delivery_time}
          />
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Proof of delivery</p>
            {hasPod ? (
              <PODViewer podSignaturePath={load.pod_signature_path} podTransfloLink={load.pod_transflo_link} />
            ) : (
              <p className="text-[15px] text-muted-foreground">No proof of delivery on file yet.</p>
            )}
          </div>
        </Section>
      </SheetContent>
    </Sheet>
  );
}
