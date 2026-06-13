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

interface StartingOdometerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string | null;
  /** Status to transition to once the odometer is recorded (typically 'in_transit'). */
  nextStatus: string;
  onComplete: () => void;
}

export function StartingOdometerDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  nextStatus,
  onComplete,
}: StartingOdometerDialogProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isOnline, enqueue } = useOfflineQueue();

  const parsed = value === '' ? NaN : parseInt(value, 10);
  const isValid = Number.isInteger(parsed) && parsed > 0;

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
    const startMiles = parsed;

    // Offline path — queue the same update.
    if (!isOnline) {
      enqueue('load_status_update', { id: loadId, status: nextStatus, start_miles: startMiles });
      toast.success('Saved. Will sync when you’re back online.');
      onComplete();
      reset();
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ status: nextStatus, start_miles: startMiles })
        .eq('id', loadId);
      if (error) throw error;

      toast.success('Load started — odometer recorded.');
      onComplete();
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Starting odometer save failed:', err);
      toast.error('Could not start load: ' + (err?.message ?? 'Unknown error'));
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
            Starting Odometer
          </DialogTitle>
          <DialogDescription>
            Please enter your starting odometer reading to begin
            {loadNumber ? ` load #${loadNumber}` : ' this load'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="start-odometer" className="text-sm font-medium">
            Odometer (miles)
          </Label>
          <IntegerInput
            id="start-odometer"
            value={value}
            onChange={setValue}
            placeholder="e.g. 647744"
            autoFocus
            disabled={isSubmitting}
            className="h-12 text-lg"
          />
          <p className="text-xs text-muted-foreground">Whole miles only.</p>
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
                Start Load
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
