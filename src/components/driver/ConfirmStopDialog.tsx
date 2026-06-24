import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StopLike {
  id: string;
  stop_number: number | null;
  stop_type: string | null;
  facility_name: string | null;
  location: string | null;
}

interface ConfirmStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: StopLike | null;
  onConfirmed?: () => void;
}

const sanitizeHours = (raw: string) => {
  // Allow digits and a single decimal point.
  let cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
  return cleaned;
};

export function ConfirmStopDialog({ open, onOpenChange, stop, onConfirmed }: ConfirmStopDialogProps) {
  const [hosValue, setHosValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setHosValue('');
      setIsSubmitting(false);
    }
  }, [open, stop?.id]);

  const num = hosValue === '' ? NaN : Number(hosValue);
  const isValid = Number.isFinite(num) && num >= 0 && num <= 11;

  const handleSubmit = async () => {
    if (!stop || !isValid) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('load_intermediate_stops')
        .update({
          status: 'completed',
          remaining_hos: num,
          completed_at: new Date().toISOString(),
        })
        .eq('id', stop.id);

      if (error) throw error;
      toast.success('Stop confirmed');
      onOpenChange(false);
      onConfirmed?.();
    } catch (err: any) {
      console.error('Confirm stop failed:', err);
      toast.error(err?.message || 'Failed to confirm stop');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Confirm Stop Delivery
          </DialogTitle>
          <DialogDescription>
            Enter your remaining hours of service to mark this stop completed.
          </DialogDescription>
        </DialogHeader>

        {stop && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Stop {stop.stop_number ?? '-'}{stop.stop_type ? ` · ${stop.stop_type}` : ''}
            </p>
            {stop.facility_name && (
              <p className="text-sm font-medium">{stop.facility_name}</p>
            )}
            {stop.location && (
              <p className="text-xs text-muted-foreground">{stop.location}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="stop-hos" className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Remaining Hours of Service <span className="text-destructive">*</span>
          </Label>
          <Input
            id="stop-hos"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={hosValue}
            onChange={(e) => setHosValue(sanitizeHours(e.target.value))}
            placeholder="e.g. 6.5"
            disabled={isSubmitting}
            className={`h-12 ${hosValue !== '' && !isValid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          {hosValue !== '' && !isValid && (
            <p className="text-[11px] text-destructive">Enter a value between 0 and 11 hours.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Rough hours only — used by dispatch for planning the next leg.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-12"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting} className="h-12">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Confirm Stop'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
