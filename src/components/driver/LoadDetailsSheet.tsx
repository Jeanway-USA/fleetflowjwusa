import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StopTime } from '@/components/shared/StopTime';
import { sumAccessorials } from '@/utils/payCalculations';
import { appointmentText, splitInstructions, statusLabel } from '@/lib/driver/load';
import { DBtn, SheetContent, Stat } from '@/components/driver/ui/driver-ui';

export interface DetailsLoad {
  id: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_end_time?: string | null;
  pickup_time_type: string | null;
  pickup_at?: string | null;
  pickup_tz?: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_end_time?: string | null;
  delivery_time_type: string | null;
  delivery_at?: string | null;
  delivery_tz?: string | null;
  status: string;
  booked_miles: number | null;
  notes: string | null;
  landstar_load_id: string | null;
  tracking_id?: string | null;
  pickup_number?: string | null;
  trailer_id?: string | null;
  trailers?: { unit_number: string | null } | null;
  load_accessorials?: Array<{ id?: string; accessorial_type?: string | null; amount?: number | null; notes?: string | null }>;
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

interface Props {
  load: DetailsLoad;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pay figure to show and what it is called ("Est. pay" or "Accessorials"). */
  payLabel: string;
  payText: string;
  readOnly?: boolean;
}

/** Everything about one load in a sheet: both ends with times, miles and pay, the pickup number, accessorials, and the dispatcher's notes. */
export function LoadDetailsSheet({ load, open, onOpenChange, payLabel, payText, readOnly }: Props) {
  const instructions = splitInstructions(load.notes);
  const pickupAppt = appointmentText(load.pickup_time_type, load.pickup_time, load.pickup_end_time);
  const deliveryAppt = appointmentText(load.delivery_time_type, load.delivery_time, load.delivery_end_time);

  const copyTracking = async () => {
    if (!load.tracking_id) return;
    await navigator.clipboard.writeText(`${window.location.origin}/track?tracking_id=${load.tracking_id}`);
    toast.success('Tracking link copied');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Load {load.landstar_load_id || 'N/A'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="mt-0.5 text-sm font-medium">{load.origin}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} legacyDate={load.pickup_date} legacyTime={load.pickup_time} legacyEndTime={load.pickup_end_time} withDate />
              </div>
              {pickupAppt && <p className="mt-1 text-xs text-muted-foreground">{pickupAppt.text}</p>}
            </div>
            <div className="rounded-lg bg-secondary px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Delivery</p>
              <p className="mt-0.5 text-sm font-medium">{load.destination}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                <StopTime utcIso={load.delivery_at} tz={load.delivery_tz} legacyDate={load.delivery_date} legacyTime={load.delivery_time} legacyEndTime={load.delivery_end_time} withDate />
              </div>
              {deliveryAppt && <p className="mt-1 text-xs text-muted-foreground">{deliveryAppt.text}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Booked miles">{load.booked_miles?.toLocaleString() ?? 'TBD'}</Stat>
            <Stat label="Status">{statusLabel(load.status)}</Stat>
            <Stat label={payLabel}>{payText}</Stat>
          </div>

          {(load.pickup_number || load.trailers?.unit_number || load.trailer_id) && (
            <div className="grid grid-cols-2 gap-3">
              {load.pickup_number && (
                <div className="rounded-lg bg-carbon/20 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Pickup number</p>
                  <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{load.pickup_number}</p>
                </div>
              )}
              {(load.trailers?.unit_number || load.trailer_id) && (
                <div className="rounded-lg bg-secondary px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Trailer</p>
                  <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{load.trailers?.unit_number || 'Assigned'}</p>
                </div>
              )}
            </div>
          )}

          {(load.load_accessorials?.length ?? 0) > 0 && (
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Accessorials</h3>
                <span className="text-sm font-medium tabular-nums">{money(sumAccessorials(load as any))}</span>
              </div>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {load.load_accessorials!.map((a, idx) => (
                  <li key={a.id ?? idx} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block capitalize">{(a.accessorial_type || 'Other').replace(/_/g, ' ')}</span>
                      {a.notes && <span className="block text-xs text-muted-foreground">{a.notes}</span>}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{money(Number(a.amount ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(instructions.main || instructions.stops) && (
            <div>
              <h3 className="text-sm font-semibold">Special instructions</h3>
              <div className="mt-2 space-y-3 rounded-lg bg-secondary px-3 py-3">
                {instructions.main && <p className="whitespace-pre-wrap text-sm leading-relaxed">{instructions.main}</p>}
                {instructions.stops && (
                  <div className={instructions.main ? 'border-t border-border pt-3' : ''}>
                    <p className="text-xs font-semibold text-muted-foreground">Intermediate stops</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{instructions.stops}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {load.tracking_id && !readOnly && (
            <DBtn tone="secondary" size="md" className="w-full" onClick={copyTracking}><Link2 /> Copy tracking link</DBtn>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}
