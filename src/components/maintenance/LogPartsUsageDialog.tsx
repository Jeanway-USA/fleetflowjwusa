import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import {
  useAllPartsInventory,
  useActiveWorkOrders,
  useTrucks,
  useLogPartUsage,
} from '@/hooks/useMaintenanceData';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ApplyTo = 'truck' | 'work_order' | 'none';

export function LogPartsUsageDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: parts = [], isLoading: partsLoading } = useAllPartsInventory();
  const { data: trucks = [] } = useTrucks();
  const { data: workOrders = [] } = useActiveWorkOrders();
  const logUsage = useLogPartUsage();

  const [partId, setPartId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [applyTo, setApplyTo] = useState<ApplyTo>('none');
  const [truckId, setTruckId] = useState<string>('');
  const [workOrderId, setWorkOrderId] = useState<string>('');

  const selectedPart = useMemo(() => parts.find(p => p.id === partId), [parts, partId]);
  const maxQty = selectedPart ? Number(selectedPart.quantity_on_hand) : 0;
  const qtyNum = Number(quantity);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= maxQty;

  const reset = () => {
    setPartId('');
    setQuantity('1');
    setApplyTo('none');
    setTruckId('');
    setWorkOrderId('');
  };

  const handleSubmit = async () => {
    if (!partId || !qtyValid) return;
    try {
      const selectedTruck = trucks?.find((t: any) => t.id === truckId);
      await logUsage.mutateAsync({
        part_id: partId,
        quantity: qtyNum,
        truck_id: applyTo === 'truck' ? truckId || null : null,
        truck_label: selectedTruck ? (selectedTruck as any).unit_number : null,
        work_order_id: applyTo === 'work_order' ? workOrderId || null : null,
      });
      toast({
        title: 'Parts usage logged',
        description: `${qtyNum} ${selectedPart?.unit || 'unit(s)'} of ${selectedPart?.part_name} deducted from inventory.`,
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Could not log usage',
        description: err?.message ?? 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Parts Usage</DialogTitle>
          <DialogDescription>
            Deduct parts from inventory and optionally tie them to a truck or active work order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="part">Part</Label>
            <Select value={partId} onValueChange={setPartId}>
              <SelectTrigger id="part">
                <SelectValue placeholder={partsLoading ? 'Loading parts…' : 'Select a part'} />
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={Number(p.quantity_on_hand) <= 0}>
                    {p.part_name} ({p.quantity_on_hand} {p.unit || 'ea'} in stock)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qty">Quantity used</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              max={maxQty || undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!selectedPart}
            />
            {selectedPart && !qtyValid && (
              <p className="text-xs text-destructive">
                Enter a number between 1 and {maxQty}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Apply to (optional)</Label>
            <Select value={applyTo} onValueChange={(v) => setApplyTo(v as ApplyTo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reference</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="work_order">Active work order</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {applyTo === 'truck' && (
            <div className="space-y-2">
              <Label htmlFor="truck">Truck</Label>
              <Select value={truckId} onValueChange={setTruckId}>
                <SelectTrigger id="truck">
                  <SelectValue placeholder="Select a truck" />
                </SelectTrigger>
                <SelectContent>
                  {(trucks || []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      Unit {t.unit_number}
                      {t.make ? ` — ${t.make}${t.model ? ` ${t.model}` : ''}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {applyTo === 'work_order' && (
            <div className="space-y-2">
              <Label htmlFor="wo">Active work order</Label>
              <Select value={workOrderId} onValueChange={setWorkOrderId}>
                <SelectTrigger id="wo">
                  <SelectValue placeholder="Select a work order" />
                </SelectTrigger>
                <SelectContent>
                  {(workOrders || []).map((wo: any) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.trucks?.unit_number ? `Unit ${wo.trucks.unit_number} — ` : ''}
                      {wo.service_type}
                      {wo.description ? ` · ${wo.description.slice(0, 40)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            loading={logUsage.isPending}
            disabled={!partId || !qtyValid}
            onClick={handleSubmit}
          >
            Log usage
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
