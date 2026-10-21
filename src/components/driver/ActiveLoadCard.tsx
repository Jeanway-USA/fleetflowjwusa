import { useMemo, useState, lazy, Suspense } from 'react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Map as MapIcon, Package } from 'lucide-react';
import { StopTime } from '@/components/shared/StopTime';
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useLoadProgress } from '@/hooks/useLoadProgress';
import { useLoadStops } from '@/hooks/useLoadStops';
import { usePaySettings } from '@/hooks/usePaySettings';
import { calculateLoadPay } from '@/utils/payCalculations';
import { appointmentText, buildLadder, shortDate, splitInstructions, statusLabel } from '@/lib/driver/load';
import { Chip, DBtn, Note, Panel, SheetContent, Stat, StatCell, StatRow, Tile } from '@/components/driver/ui/driver-ui';
import { StopTimeline } from '@/components/driver/home/StopTimeline';
import { LoadDetailsSheet, type DetailsLoad } from './LoadDetailsSheet';
import { LoadProgressDialogs } from './LoadProgressDialogs';
import { ConfirmStopDialog } from './ConfirmStopDialog';
import { DocumentScanButton } from './DocumentScanButton';
import { ReportIssueTile } from './ReportIssueTile';

const LoadRouteMap = lazy(() => import('./LoadRouteMap').then((m) => ({ default: m.LoadRouteMap })));

interface Load extends DetailsLoad {
  rate: number | null;
  empty_miles?: number | null;
  start_miles?: number | null;
  end_miles?: number | null;
  pod_required?: boolean;
  is_in_bond?: boolean | null;
  cf_7512_number?: string | null;
  driver_id?: string | null;
}

interface ActiveLoadCardProps {
  load: Load | undefined;
  payRate: number | null;
  payType: string | null;
  driverId?: string;
  /** The driver's truck, for the Issue quick action. */
  truckId?: string;
  onStatusUpdate?: () => void;
  /** The owner watching a driver's screen: show everything, offer no actions. */
  readOnly?: boolean;
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const chipTone = (status: string) =>
  status === 'in_transit' ? 'active' : status === 'delivered' ? 'good' : status === 'cancelled' ? 'bad' : status === 'loading' ? 'warn' : 'neutral';

/**
 * The current load, run from one card: where the next stop is, the stops as a timeline, and the one button that
 * moves the trip on. The status steps, offline queue and optimistic update live in `useLoadProgress`.
 */
export function ActiveLoadCard({ load, payRate, payType, driverId, truckId, onStatusUpdate, readOnly }: ActiveLoadCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const progress = useLoadProgress(load, onStatusUpdate);
  // Single source of truth for pay math. Must be called before any early return.
  const paySettings = usePaySettings();
  const { data: stops } = useLoadStops(load?.id);
  const rows = useMemo(() => (load ? buildLadder(load, stops) : []), [load, stops]);

  if (!load) {
    return (
      <Panel className="flex flex-col items-center px-4 py-10 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">No active load</h2>
        <p className="mt-1 text-sm text-muted-foreground">Check with dispatch for your next assignment.</p>
      </Panel>
    );
  }

  const nextRow = rows.find((r) => r.next) ?? null;
  const pendingStop = nextRow?.kind === 'stop' ? nextRow.stop ?? null : null;
  const confirmingStop = (stops ?? []).find((s) => s.id === confirmingStopId) ?? null;
  const headingToPickup = nextRow?.kind === 'pickup';
  const owner = driverId ?? load.driver_id ?? '';

  const payBreakdown = calculateLoadPay(load, { pay_type: payType, pay_rate: payRate }, paySettings);
  const payLabel = payBreakdown.payType === 'flat' ? 'Accessorials' : 'Est. pay';
  const payText = payBreakdown.payType === 'flat'
    ? (payBreakdown.accessorialsTotal > 0 ? `+${money(payBreakdown.accessorialsTotal)}` : '-')
    : money(payBreakdown.total);
  const instructions = splitInstructions(load.notes);

  const primary = pendingStop
    ? { label: `Confirm stop ${pendingStop.stop_number ?? (nextRow ? nextRow.index - 1 : '')}`, run: () => setConfirmingStopId(pendingStop.id), busy: false }
    : progress.nextStatus
      ? { label: progress.label, run: progress.run, busy: progress.isUpdating }
      : null;

  const nextAppt = nextRow?.kind === 'pickup'
    ? appointmentText(load.pickup_time_type, load.pickup_time, load.pickup_end_time)
    : nextRow?.kind === 'delivery'
      ? appointmentText(load.delivery_time_type, load.delivery_time, load.delivery_end_time)
      : null;

  return (
    <div className="space-y-3">
      {load.is_in_bond && (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-destructive px-4 py-3 text-destructive-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">In-bond shipment. Do not break the seal.</p>
            {load.cf_7512_number && <p className="mt-0.5 truncate font-mono text-xs">CF 7512: {load.cf_7512_number}</p>}
          </div>
        </div>
      )}

      <Panel>
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <span className="text-sm text-muted-foreground">Load {load.landstar_load_id || 'N/A'}</span>
          <Chip tone={chipTone(load.status)}>{statusLabel(load.status)}</Chip>
        </div>

        <div className="px-4 pb-4 pt-3">
          {nextRow ? (
            <>
              <p className="text-sm text-muted-foreground">{nextRow.kind === 'pickup' ? 'Pick up at' : nextRow.kind === 'delivery' ? 'Deliver to' : 'Next stop'}</p>
              <p className="mt-0.5 break-words font-condensed text-4xl font-bold leading-[1.05] text-foreground">{nextRow.place}</p>
              {nextRow.detail && nextRow.detail !== nextRow.place && <p className="mt-1.5 text-sm text-muted-foreground">{nextRow.detail}</p>}
              <p className="mt-2 text-sm font-medium text-foreground">
                {nextRow.kind === 'stop'
                  ? shortDate(nextRow.stop?.scheduled_date) ?? 'No time set'
                  : (
                    <StopTime
                      utcIso={nextRow.kind === 'pickup' ? load.pickup_at : load.delivery_at}
                      tz={nextRow.kind === 'pickup' ? load.pickup_tz : load.delivery_tz}
                      legacyDate={nextRow.kind === 'pickup' ? load.pickup_date : load.delivery_date}
                      legacyTime={nextRow.kind === 'pickup' ? load.pickup_time : load.delivery_time}
                      legacyEndTime={nextRow.kind === 'pickup' ? load.pickup_end_time : load.delivery_end_time}
                      withDate
                      hideSecondary
                      className="font-medium"
                    />
                  )}
                {nextAppt && <span className="font-normal text-muted-foreground">, {nextAppt.label.toLowerCase()}</span>}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white"><CheckCircle2 className="h-6 w-6" /></span>
              <p className="font-condensed text-3xl font-bold">Delivered</p>
            </div>
          )}

          {headingToPickup && load.pickup_number && (
            <div className="mt-4 rounded-lg bg-carbon/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Pickup number, give it at the gate</p>
              <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-foreground">{load.pickup_number}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-4">
          <StopTimeline rows={rows} load={load} />
        </div>

        <StatRow>
          <StatCell><Stat label="Miles">{load.booked_miles ? load.booked_miles.toLocaleString() : '-'}</Stat></StatCell>
          <StatCell><Stat label={payLabel}>{payText}</Stat></StatCell>
        </StatRow>

        {!readOnly && primary && (
          <div className="space-y-2 border-t border-border p-4">
            <DBtn tone="primary" size="lg" className="w-full" disabled={primary.busy} onClick={primary.run}>
              {primary.busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {primary.busy ? 'Updating' : primary.label}
            </DBtn>
            {pendingStop && progress.nextStatus === 'delivered' && (
              <DBtn tone="ghost" size="md" className="w-full text-muted-foreground" onClick={progress.run} disabled={progress.isUpdating}>Skip stops and mark delivered</DBtn>
            )}
          </div>
        )}
      </Panel>

      {!readOnly && (
        <div className="grid grid-cols-4 gap-2">
          <DocumentScanButton driverId={owner} variant="tile" />
          <Tile icon={<FileText />} label="Details" onClick={() => setDetailsOpen(true)} />
          <Tile icon={<MapIcon />} label="Map" onClick={() => setMapOpen(true)} />
          <ReportIssueTile driverId={owner} truckId={truckId} />
        </div>
      )}

      {(instructions.main || instructions.stops) && (
        <Panel>
          <button type="button" onClick={() => setDetailsOpen(true)} className="block w-full px-4 py-3 text-left">
            <span className="text-[15px] font-semibold text-foreground">Instructions</span>
            <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{instructions.main || instructions.stops}</span>
            <span className="mt-1.5 block text-sm font-semibold text-primary">Read all</span>
          </button>
        </Panel>
      )}

      <LoadProgressDialogs progress={progress} load={load} driverId={driverId} onStatusUpdate={onStatusUpdate} />

      <ConfirmStopDialog
        open={!!confirmingStop}
        onOpenChange={(o) => !o && setConfirmingStopId(null)}
        stop={confirmingStop}
        onConfirmed={() => onStatusUpdate?.()}
      />

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <SheetContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Route</DialogTitle>
          </DialogHeader>
          {mapOpen && (
            <ErrorBoundary compact fallback={<Note>Map unavailable on this connection.</Note>}>
              <Suspense fallback={<MapSkeleton height={260} />}>
                <LoadRouteMap origin={load.origin} destination={load.destination} notes={load.notes} loadId={load.id} />
              </Suspense>
            </ErrorBoundary>
          )}
        </SheetContent>
      </Dialog>

      <LoadDetailsSheet load={load} open={detailsOpen} onOpenChange={setDetailsOpen} payLabel={payLabel} payText={payText} readOnly={readOnly} />
    </div>
  );
}
