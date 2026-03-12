import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface StatusOption {
  value: string;
  label: string;
}

interface BulkStatusEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (status: string) => void;
  count: number;
  statusOptions: StatusOption[];
  isUpdating?: boolean;
  entityName?: string;
}

export function BulkStatusEditDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
  statusOptions,
  isUpdating = false,
  entityName = 'items',
}: BulkStatusEditDialogProps) {
  const [status, setStatus] = useState('');

  const handleConfirm = () => {
    if (!status) return;
    onConfirm(status);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setStatus(''); onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update {count} {entityName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!status || isUpdating}>
            {isUpdating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : `Update ${count} ${entityName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
