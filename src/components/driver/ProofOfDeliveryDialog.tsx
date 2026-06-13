import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IntegerInput } from '@/components/ui/numeric-input';
import { SignaturePad } from './SignaturePad';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOptimisticLoadStatus, NETWORK_ERROR_TOAST } from '@/hooks/useOptimisticLoadStatus';
import { CheckCircle, Loader2, ClipboardCheck, AlertTriangle, ExternalLink, Gauge } from 'lucide-react';
import { format } from 'date-fns';

interface ProofOfDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string | null;
  destination: string;
  driverId: string;
  /** Starting odometer recorded when the load began. Used to validate the ending odometer. */
  startMiles: number | null;
  onComplete: () => void;
}

export function ProofOfDeliveryDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  destination,
  driverId,
  startMiles,
  onComplete,
}: ProofOfDeliveryDialogProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [transfloLink, setTransfloLink] = useState('');
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [hasException, setHasException] = useState(false);
  const [endOdometer, setEndOdometer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { applyOptimistic } = useOptimisticLoadStatus();

  const parsedEnd = endOdometer === '' ? NaN : parseInt(endOdometer, 10);
  const hasEnd = Number.isInteger(parsedEnd) && parsedEnd > 0;
  const hasStart = typeof startMiles === 'number' && startMiles >= 0;
  const endViolatesStart = hasStart && hasEnd && parsedEnd <= (startMiles as number);
  const isOdometerValid = hasEnd && !endViolatesStart;

  const isValidTransfloLink = (url: string) =>
    url.trim() === '' || url.trim().startsWith('https://viewer.transfloexpress.com/');

  const handleSubmit = async () => {
    if (!signatureDataUrl) {
      toast.error('Please provide a signature to confirm delivery');
      return;
    }

    if (!hasEnd) {
      toast.error('Please enter your ending odometer reading');
      return;
    }

    if (endViolatesStart) {
      toast.error(`Ending odometer must be greater than starting odometer (${(startMiles as number).toLocaleString()} mi)`);
      return;
    }

    if (transfloLink.trim() && !isValidTransfloLink(transfloLink)) {
      toast.error('Please enter a valid Transflo Express link');
      return;
    }

    setIsSubmitting(true);

    // Optimistically flip the load to delivered on the driver dashboard
    // so the UI feels instant even on flaky cell. We commit/rollback below.
    const optimisticPatch: Record<string, unknown> = {
      status: 'delivered',
      end_miles: parsedEnd,
    };
    if (hasStart) optimisticPatch.actual_miles = parsedEnd - (startMiles as number);
    const { commit, rollback } = applyOptimistic(loadId, optimisticPatch);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch org_id early for document inserts
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      // 1. Upload signature as a document
      const signatureBlob = await (await fetch(signatureDataUrl)).blob();
      const sigPath = `pod/${user.id}/${loadId}/signature-${Date.now()}.png`;
      const { error: sigUploadError } = await supabase.storage
        .from('dvir-photos')
        .upload(sigPath, signatureBlob, { contentType: 'image/png' });

      if (sigUploadError) {
        console.warn('Signature upload failed, continuing anyway:', sigUploadError.message);
      }

      // 2. Save document records
      const docInserts: { document_type: string; file_name: string; file_path: string; related_type: string; related_id: string; uploaded_by: string; org_id: string | null }[] = [];
      if (!sigUploadError) {
        docInserts.push({
          document_type: 'pod_signature',
          file_name: `POD Signature - Load ${loadNumber || loadId.substring(0, 8)}`,
          file_path: sigPath,
          related_type: 'load',
          related_id: loadId,
          uploaded_by: user.id,
          org_id: profile?.org_id ?? null,
        });
      }

      // Save Transflo link as a document record
      if (transfloLink.trim()) {
        docInserts.push({
          document_type: 'transflo_pod',
          file_name: `Transflo POD - Load ${loadNumber || loadId.substring(0, 8)}`,
          file_path: transfloLink.trim(),
          related_type: 'load',
          related_id: loadId,
          uploaded_by: user.id,
          org_id: profile?.org_id ?? null,
        });
      }

      if (docInserts.length > 0) {
        await supabase.from('documents').insert(docInserts);
      }

      // 3. Update load status to delivered
      const deliveryNotes = hasException && exceptionNotes
        ? `\n--- POD Exception ---\n${exceptionNotes}`
        : '';

      const updateData: Record<string, any> = {
        status: 'delivered',
        delivery_date: format(new Date(), 'yyyy-MM-dd'),
        pod_signature_path: !sigUploadError ? sigPath : null,
        pod_transflo_link: transfloLink.trim() || null,
        end_miles: parsedEnd,
      };
      if (hasStart) {
        updateData.actual_miles = parsedEnd - (startMiles as number);
      }

      if (deliveryNotes) {
        const { data: currentLoad } = await supabase
          .from('fleet_loads')
          .select('notes')
          .eq('id', loadId)
          .single();

        updateData.notes = (currentLoad?.notes || '') + deliveryNotes;
      }

      const { error: updateError } = await supabase
        .from('fleet_loads')
        .update(updateData)
        .eq('id', loadId);

      if (updateError) throw updateError;

      // 4. Log status change
      await supabase.from('load_status_logs').insert({
        load_id: loadId,
        previous_status: 'in_transit',
        new_status: 'delivered',
        changed_by: user.id,
        org_id: profile?.org_id,
        notes: hasException ? `Delivered with exceptions: ${exceptionNotes}` : 'Delivered - POD captured',
      });

      toast.success('Delivery confirmed! POD captured successfully.');
      commit();

      // Cleanup
      setSignatureDataUrl(null);
      setTransfloLink('');
      setExceptionNotes('');
      setHasException(false);
      setEndOdometer('');
      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error('POD submission error:', error);
      // Revert the optimistic status flip and show the friendly retry toast.
      rollback({ silent: true });
      toast.error(NETWORK_ERROR_TOAST);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSignatureDataUrl(null);
      setTransfloLink('');
      setExceptionNotes('');
      setHasException(false);
      setEndOdometer('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Proof of Delivery
          </DialogTitle>
          <DialogDescription>
            Load #{loadNumber || 'N/A'} — {destination}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Delivery timestamp */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Delivery Time</span>
            <span className="font-medium text-sm">
              {format(new Date(), 'MMM d, yyyy h:mm a')}
            </span>
          </div>

          {/* Ending Odometer (required) */}
          <div className="space-y-2">
            <Label htmlFor="pod-end-odometer" className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Ending Odometer <span className="text-destructive">*</span>
            </Label>
            <IntegerInput
              id="pod-end-odometer"
              value={endOdometer}
              onChange={setEndOdometer}
              placeholder={hasStart ? `Must be > ${(startMiles as number).toLocaleString()}` : 'e.g. 648611'}
              disabled={isSubmitting}
              className={`h-12 text-lg ${endViolatesStart ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            />
            {hasStart ? (
              <p className="text-xs text-muted-foreground">
                Starting odometer: <span className="font-medium text-foreground">{(startMiles as number).toLocaleString()}</span> mi
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No starting odometer recorded — any positive reading is allowed.
              </p>
            )}
            {endViolatesStart && (
              <p className="text-xs font-medium text-destructive">
                Ending odometer must be greater than the starting odometer ({(startMiles as number).toLocaleString()} mi).
              </p>
            )}
          </div>


          {/* Transflo POD Link */}
          <div className="space-y-2">
            <Label htmlFor="transflo-link" className="text-sm font-medium flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Transflo POD Link
            </Label>
            <Input
              id="transflo-link"
              type="url"
              placeholder="https://viewer.transfloexpress.com/ViewBatchExM.aspx?ConfNumber=..."
              value={transfloLink}
              onChange={(e) => setTransfloLink(e.target.value)}
              disabled={isSubmitting}
              className={transfloLink && !isValidTransfloLink(transfloLink) ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground">
              Paste the link from your Transflo Express app (optional)
            </p>
            {transfloLink && !isValidTransfloLink(transfloLink) && (
              <p className="text-xs text-destructive">
                Link must start with https://viewer.transfloexpress.com/
              </p>
            )}
          </div>

          {/* Signature */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Receiver Signature</Label>
            {signatureDataUrl ? (
              <div className="space-y-2">
                <div className="border rounded-lg overflow-hidden bg-white p-2">
                  <img src={signatureDataUrl} alt="Signature" className="w-full h-auto" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSignatureDataUrl(null)}
                  disabled={isSubmitting}
                >
                  Re-sign
                </Button>
              </div>
            ) : (
              <SignaturePad
                onSignatureCapture={setSignatureDataUrl}
                disabled={isSubmitting}
              />
            )}
          </div>

          {/* Exception toggle */}
          <div className="space-y-2">
            <Button
              type="button"
              variant={hasException ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setHasException(!hasException)}
              disabled={isSubmitting}
              className="w-full"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {hasException ? 'Exception Reported' : 'Report Delivery Exception'}
            </Button>

            {hasException && (
              <Textarea
                placeholder="Describe the exception (damaged freight, shortage, wrong items, refused, etc.)"
                value={exceptionNotes}
                onChange={(e) => setExceptionNotes(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !signatureDataUrl || !isOdometerValid}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Delivery
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
