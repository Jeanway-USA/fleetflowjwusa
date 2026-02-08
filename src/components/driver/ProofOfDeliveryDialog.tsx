import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SignaturePad } from './SignaturePad';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, Camera, ImageIcon, Loader2, X, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface ProofOfDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string | null;
  destination: string;
  driverId: string;
  onComplete: () => void;
}

export function ProofOfDeliveryDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
  destination,
  driverId,
  onComplete,
}: ProofOfDeliveryDialogProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [hasException, setHasException] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: { file: File; preview: string }[] = [];
    const remaining = 5 - photos.length;

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newPhotos.push({ file, preview: URL.createObjectURL(file) });
      }
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    // Reset the input
    if (e.target) e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!signatureDataUrl) {
      toast.error('Please provide a signature to confirm delivery');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Upload signature as a document
      const signatureBlob = await (await fetch(signatureDataUrl)).blob();
      const sigPath = `pod/${user.id}/${loadId}/signature-${Date.now()}.png`;
      const { error: sigUploadError } = await supabase.storage
        .from('dvir-photos')
        .upload(sigPath, signatureBlob, { contentType: 'image/png' });
      
      if (sigUploadError) {
        console.warn('Signature upload failed, continuing anyway:', sigUploadError.message);
      }

      // 2. Upload BOL/POD photos
      const uploadedPaths: string[] = [];
      for (const photo of photos) {
        const filePath = `pod/${user.id}/${loadId}/${Date.now()}-${photo.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('dvir-photos')
          .upload(filePath, photo.file);
        
        if (uploadError) {
          console.warn('Photo upload failed:', uploadError.message);
        } else {
          uploadedPaths.push(filePath);
        }
      }

      // 3. Save document records for each uploaded file
      const docInserts = [];
      if (!sigUploadError) {
        docInserts.push({
          document_type: 'pod_signature',
          file_name: `POD Signature - Load ${loadNumber || loadId.substring(0, 8)}`,
          file_path: sigPath,
          related_type: 'load',
          related_id: loadId,
          uploaded_by: user.id,
        });
      }
      for (const path of uploadedPaths) {
        docInserts.push({
          document_type: 'proof_of_delivery',
          file_name: `POD Photo - Load ${loadNumber || loadId.substring(0, 8)}`,
          file_path: path,
          related_type: 'load',
          related_id: loadId,
          uploaded_by: user.id,
        });
      }

      if (docInserts.length > 0) {
        await supabase.from('documents').insert(docInserts);
      }

      // 4. Update load status to delivered with delivery timestamp
      const deliveryNotes = hasException && exceptionNotes
        ? `\n--- POD Exception ---\n${exceptionNotes}`
        : '';

      const updateData: Record<string, any> = {
        status: 'delivered',
        delivery_date: format(new Date(), 'yyyy-MM-dd'),
      };

      // Append exception notes to existing notes if any
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

      // 5. Log status change
      await supabase.from('load_status_logs').insert({
        load_id: loadId,
        previous_status: 'in_transit',
        new_status: 'delivered',
        changed_by: user.id,
        notes: hasException ? `Delivered with exceptions: ${exceptionNotes}` : 'Delivered - POD captured',
      });

      // 6. Create notification for dispatch
      // We don't know the dispatcher's driver_id, so we skip driver_notifications
      // The load status change itself serves as the notification via dashboard queries

      toast.success('Delivery confirmed! POD captured successfully.');

      // Cleanup
      photos.forEach(p => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setSignatureDataUrl(null);
      setExceptionNotes('');
      setHasException(false);
      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error('POD submission error:', error);
      toast.error('Failed to submit proof of delivery: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      photos.forEach(p => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setSignatureDataUrl(null);
      setExceptionNotes('');
      setHasException(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
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

          {/* BOL / POD Photos */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">BOL / POD Photos</Label>
            <p className="text-xs text-muted-foreground">
              Take photos of the signed Bill of Lading or delivery receipt
            </p>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img
                      src={photo.preview}
                      alt={`POD photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => removePhoto(index)}
                      disabled={isSubmitting}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 5 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Gallery
                </Button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
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
            disabled={isSubmitting || !signatureDataUrl}
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