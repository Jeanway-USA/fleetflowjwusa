import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompleteWorkOrder, WorkOrder } from '@/hooks/useMaintenanceData';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CompleteJobModalProps {
  workOrder: WorkOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompleteJobModal({ workOrder, open, onOpenChange }: CompleteJobModalProps) {
  const [finalCost, setFinalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const completeWorkOrder = useCompleteWorkOrder();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!workOrder) return;
    
    const cost = parseFloat(finalCost);
    if (isNaN(cost) || cost < 0) {
      toast.error('Please enter a valid cost');
      return;
    }

    try {
      setUploading(true);
      let invoiceUrl: string | undefined;

      // Upload invoice if provided
      if (invoiceFile) {
        const fileExt = invoiceFile.name.split('.').pop();
        const fileName = `${workOrder.id}-invoice-${Date.now()}.${fileExt}`;
        const filePath = `invoices/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, invoiceFile);

        if (uploadError) throw uploadError;

        // Store the path (not public URL) for private bucket
        invoiceUrl = filePath;
      }

      await completeWorkOrder.mutateAsync({
        id: workOrder.id,
        final_cost: cost,
        invoice_url: invoiceUrl,
        notes: notes || undefined,
      });

      toast.success('Work order completed successfully');
      onOpenChange(false);
      
      // Reset form
      setFinalCost('');
      setNotes('');
      setInvoiceFile(null);
    } catch (error) {
      console.error('Error completing work order:', error);
      toast.error('Failed to complete work order');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            Complete Work Order
          </DialogTitle>
          <DialogDescription>
            {workOrder?.trucks?.unit_number && (
              <>Unit {workOrder.trucks.unit_number} - </>
            )}
            {workOrder?.service_type} ({workOrder?.vendor || 'No vendor'})
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="finalCost">Final Cost *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="finalCost"
                type="number"
                min="0"
                step="0.01"
                className="pl-7"
                placeholder="0.00"
                value={finalCost}
                onChange={(e) => setFinalCost(e.target.value)}
              />
            </div>
            {workOrder?.cost_estimate && (
              <p className="text-xs text-muted-foreground">
                Estimated: ${workOrder.cost_estimate.toLocaleString()}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice">Invoice Photo (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="invoice"
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="flex-1"
              />
              {invoiceFile && (
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {invoiceFile.name}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Completion Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about the completed work..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!finalCost || uploading || completeWorkOrder.isPending}
            className="gap-2"
          >
            {(uploading || completeWorkOrder.isPending) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploading ? 'Uploading...' : 'Completing...'}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Complete Job
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
