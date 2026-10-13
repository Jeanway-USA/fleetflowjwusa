import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateTruckStatus, type TruckStatus } from '@/hooks/useMaintenanceData';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: TruckStatus; label: string }> = [
  { value: 'active', label: 'On the road' },
  { value: 'in_shop', label: 'In the shop' },
  { value: 'out_of_service', label: 'Out of service' },
  { value: 'pending_inspection', label: 'Needs inspection' },
];

/** Sets whether a truck can be dispatched. Dispatch and the fleet counts read this, so it is one tap and one place. */
export function TruckStatusControl({ truckId, status, touch }: { truckId: string; status: string | null | undefined; touch?: boolean }) {
  const update = useUpdateTruckStatus();
  return (
    <Select value={(status as TruckStatus) ?? 'active'} disabled={update.isPending} onValueChange={(v) => update.mutate({ truck_id: truckId, status: v as TruckStatus }, { onSuccess: () => toast.success('Truck status updated.'), onError: (e: any) => toast.error(e.message) })}>
      <SelectTrigger className={cn(touch ? 'h-14 text-base' : 'h-11')}><SelectValue /></SelectTrigger>
      <SelectContent>{OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
