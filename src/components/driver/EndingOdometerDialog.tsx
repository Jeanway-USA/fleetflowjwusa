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
import { IntegerInput } from '@/components/ui/numeric-input';
import { CheckCircle, Gauge, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

interface EndingOdometerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string | null;
  /** Starting odometer recorded when the driver began the load (may be missing on legacy loads). */
  startMiles: number | null;
  /** Status to transition to (typically 'delivered'). */
  nextStatus: string;
  onComplete: () => void;
}

export function EndingOdometerDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  startMiles,
  nextStatus,
  onComplete,
}: EndingOdometerDialogProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isOnline, enqueue } = useOfflineQueue();

  const parsed = value === '' ? NaN : parseInt(value, 10);
  const isPositiveInt = Number.isInteger(parsed) && parsed > 0;
  const hasStart = typeof startMiles === 'number' && startMiles >= 0;
  const violatesStart = hasStart && isPositiveInt && parsed <= (startMiles as number);
  const isValid = isPositiveInt && !violatesStart;

  const reset = () => {
    setValue('');
    setIsSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    const endMiles = parsed;
    const actualMiles = hasStart ? endMiles - (startMiles as number) : null;

    if (!isOnline) {
      enqueue('load_status_update', {
        id: loadId,
        status: nextStatus,
        end_miles: endMiles,
        ...(actualMiles !== null ? { actual_miles: actualMiles } : {}),
      });
      toast.success('Saved. Will sync when you’re back online.');
      onComplete();
      reset();
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const update: Record<string, unknown> = {
        status: nextStatus,
        end_miles: endMiles,
      };
      if (actualMiles !== null) update.actual_miles = actualMiles;

      const { error } = await supabase
        .from('fleet_loads')
        .update(update)
        .eq('id', loadId);
      if (error) throw error;

      toast.success('Load delivered — odometer recorded.');
      onComplete();
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Ending odometer save failed:', err);
      toast.error('Could not complete load: ' + (err?.message ?? 'Unknown error'));
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
            Ending Odometer
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
