import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { IntegerInput } from '@/components/ui/numeric-input';
import { CheckCircle, Clock, Gauge, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useOptimisticLoadStatus } from '@/hooks/useOptimisticLoadStatus';

interface EndingOdometerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string | null;
  /** Starting odometer recorded when the driver began the load (may be missing on legacy loads). */
  startMiles: number | null;
  /** Driver record id for saving HOS snapshot. */
  driverId: string | null;
  /** Status to transition to (typically 'delivered'). */
  nextStatus: string;
  onComplete: () => void;
}

// Allow only 0-99.5 with up to 1 decimal place
function sanitizeHours(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '');
    const [i, d = ''] = cleaned.split('.');
    cleaned = d.length > 1 ? `${i}.${d.slice(0, 1)}` : cleaned;
  }
  if (/^0\d/.test(cleaned)) cleaned = cleaned.replace(/^0+/, '');
  return cleaned;
}

export function EndingOdometerDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  startMiles,
  driverId,
  nextStatus,
  onComplete,
}: EndingOdometerDialogProps) {
  const [value, setValue] = useState('');
  const [driveHours, setDriveHours] = useState('');
  const [cycleHours, setCycleHours] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isOnline, enqueue } = useOfflineQueue();
  const { applyOptimistic } = useOptimisticLoadStatus();
  const queryClient = useQueryClient();

  const parsed = value === '' ? NaN : parseInt(value, 10);
  const isPositiveInt = Number.isInteger(parsed) && parsed > 0;
  const hasStart = typeof startMiles === 'number' && startMiles >= 0;
  const violatesStart = hasStart && isPositiveInt && parsed <= (startMiles as number);
  const odometerValid = isPositiveInt && !violatesStart;

  const driveNum = driveHours === '' ? NaN : parseFloat(driveHours);
  const cycleNum = cycleHours === '' ? NaN : parseFloat(cycleHours);
  const driveValid = Number.isFinite(driveNum) && driveNum >= 0 && driveNum <= 11;
  const cycleValid = Number.isFinite(cycleNum) && cycleNum >= 0 && cycleNum <= 70;

  const isValid = odometerValid && driveValid && cycleValid;

  const reset = () => {
    setValue('');
    setDriveHours('');
    setCycleHours('');
    setIsSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    const endMiles = parsed;
    const actualMiles = hasStart ? endMiles - (startMiles as number) : null;
    const nowIso = new Date().toISOString();

    if (!isOnline) {
      enqueue('load_status_update', {
        id: loadId,
        status: nextStatus,
        end_miles: endMiles,
        ...(actualMiles !== null ? { actual_miles: actualMiles } : {}),
      });
      if (driverId) {
        enqueue('driver_hos_update', {
          id: driverId,
          remaining_drive_hours: driveNum,
          remaining_cycle_hours: cycleNum,
          hos_last_updated: nowIso,
        });
      }
      toast.success('Saved. Will sync when you’re back online.');
      onComplete();
      reset();
      onOpenChange(false);
      return;
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      end_miles: endMiles,
    };
    if (actualMiles !== null) update.actual_miles = actualMiles;

    setIsSubmitting(true);
    const { commit, rollback } = applyOptimistic(loadId, update);
    reset();
    onOpenChange(false);

    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update(update)
        .eq('id', loadId);
      if (error) throw error;

      toast.success('Load delivered — odometer recorded.');
      commit();

      // Save HOS snapshot (non-blocking failure — load is already delivered).
      if (driverId) {
        const { error: hosErr } = await supabase
          .from('drivers')
          .update({
            remaining_drive_hours: driveNum,
            remaining_cycle_hours: cycleNum,
            hos_last_updated: nowIso,
          })
          .eq('id', driverId);
        if (hosErr) {
          console.error('HOS snapshot save failed:', hosErr);
          toast.error('HOS snapshot failed to save');
        } else {
          queryClient.invalidateQueries({ queryKey: ['driver-for-user'] });
        }
      }

      onComplete();
    } catch (err: any) {
      console.error('Ending odometer save failed:', err);
      rollback();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Complete Load
          </DialogTitle>
          <DialogDescription>
            Enter your final odometer reading to complete
            {loadNumber ? ` load #${loadNumber}` : ' this load'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="end-odometer" className="text-sm font-medium">
            Odometer (miles)
          </Label>
          <IntegerInput
            id="end-odometer"
            value={value}
            onChange={setValue}
            placeholder={hasStart ? `Must be > ${(startMiles as number).toLocaleString()}` : 'e.g. 648611'}
            autoFocus
            disabled={isSubmitting}
            className={`h-12 text-lg ${violatesStart ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          {hasStart ? (
            <p className="text-xs text-muted-foreground">
              Starting odometer: <span className="font-medium text-foreground">{(startMiles as number).toLocaleString()}</span> mi
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No starting odometer recorded for this load — any positive reading is allowed.
            </p>
          )}
          {violatesStart && (
            <p className="text-xs font-medium text-destructive">
              Ending odometer must be greater than the starting odometer ({(startMiles as number).toLocaleString()} mi).
            </p>
          )}
        </div>

        {/* HOS Snapshot — for dispatch pre-planning only, not an ELD. */}
        <div className="rounded-md border bg-muted/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Current HOS Snapshot (For Dispatch)</h4>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Rough hours only — used for dispatch planning.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="drive-hours" className="text-xs font-medium">
                Remaining Drive Time (Hours) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="drive-hours"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={driveHours}
                onChange={(e) => setDriveHours(sanitizeHours(e.target.value))}
                placeholder="e.g. 4.5"
                disabled={isSubmitting}
                className={`h-11 ${driveHours !== '' && !driveValid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {driveHours !== '' && !driveValid && (
                <p className="text-[11px] text-destructive">Enter 0–11 hours.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-hours" className="text-xs font-medium">
                Remaining Cycle / 70-Hour (Hours) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cycle-hours"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cycleHours}
                onChange={(e) => setCycleHours(sanitizeHours(e.target.value))}
                placeholder="e.g. 32"
                disabled={isSubmitting}
                className={`h-11 ${cycleHours !== '' && !cycleValid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {cycleHours !== '' && !cycleValid && (
                <p className="text-[11px] text-destructive">Enter 0–70 hours.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Load
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
