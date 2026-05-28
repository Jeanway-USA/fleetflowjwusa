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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { useTrucks, useUpdateTruckStatus, type TruckStatus } from '@/hooks/useMaintenanceData';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS: { value: TruckStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'in_shop', label: 'In Shop' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'pending_inspection', label: 'Pending Inspection' },
];

export function UpdateTruckStatusDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: trucks = [] } = useTrucks();
  const update = useUpdateTruckStatus();

  const [truckId, setTruckId] = useState('');
  const [status, setStatus] = useState<TruckStatus | ''>('');

  const reset = () => {
    setTruckId('');
    setStatus('');
  };

  const handleSubmit = async () => {
    if (!truckId || !status) return;
    try {
      await update.mutateAsync({ truck_id: truckId, status });
      const truck = (trucks as any[]).find((t) => t.id === truckId);
      const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
      toast({
        title: 'Truck status updated',
        description: truck ? `Unit ${truck.unit_number} is now ${label}.` : `Status set to ${label}.`,
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Could not update truck status',
        description: err?.message ?? 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Truck Status</DialogTitle>
          <DialogDescription>
            Quickly change a vehicle's availability. This updates status badges across the dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="truck">Truck</Label>
            <Select value={truckId} onValueChange={setTruckId}>
              <SelectTrigger id="truck">
                <SelectValue placeholder="Select a truck" />
              </SelectTrigger>
              <SelectContent>
                {(trucks as any[]).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    Unit {t.unit_number}
                    {t.make ? ` — ${t.make}${t.model ? ` ${t.model}` : ''}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TruckStatus)}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            loading={update.isPending}
            disabled={!truckId || !status}
            onClick={handleSubmit}
          >
            Update status
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
