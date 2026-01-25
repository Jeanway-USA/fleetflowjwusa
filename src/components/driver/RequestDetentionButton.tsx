import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, Loader2 } from 'lucide-react';

interface RequestDetentionButtonProps {
  loadId: string;
  driverId: string;
  loadNumber: string | null;
  disabled?: boolean;
}

export function RequestDetentionButton({ 
  loadId, 
  driverId, 
  loadNumber,
  disabled = false 
}: RequestDetentionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Create a notification for dispatch
      const { error } = await supabase
        .from('driver_notifications')
        .insert({
          driver_id: driverId,
          title: 'Detention Request',
          message: `Driver is requesting detention for Load #${loadNumber || 'N/A'}. ${notes ? `Notes: ${notes}` : ''}`,
          notification_type: 'detention_request',
          related_id: loadId,
        });

      if (error) throw error;

      toast.success('Detention request sent to dispatch');
      setIsOpen(false);
      setNotes('');
    } catch (error) {
      console.error('Error submitting detention request:', error);
      toast.error('Failed to submit detention request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="gap-1"
      >
        <Clock className="h-4 w-4" />
        Request Detention
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Request Detention
            </DialogTitle>
            <DialogDescription>
              Notify dispatch that you are experiencing a delay at the shipper or receiver.
              Detention begins after 2 hours of waiting (unless otherwise noted).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p className="font-medium">Load #{loadNumber || 'N/A'}</p>
              <p className="text-muted-foreground text-xs mt-1">
                A notification will be sent to dispatch with your request.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="e.g., Waiting at dock 5, no unloading crew available..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
