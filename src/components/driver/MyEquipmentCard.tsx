import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Container, Truck as TruckIcon } from 'lucide-react';
import { Chip, Panel, PanelHead } from '@/components/driver/ui/driver-ui';

interface AssignedTruck {
  id: string;
  unit_number?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  status?: string | null;
}

interface MyEquipmentCardProps {
  driverId: string;
  assignedTruck?: AssignedTruck | null;
}

type Severity = 'destructive' | 'warning' | 'ok';

function resolveSeverity(status?: string | null, hasOpenWorkOrder = false): Severity {
  const s = (status || '').toLowerCase();
  if (s === 'out_of_service' || s === 'down') return 'destructive';
  if (s === 'in_shop' || hasOpenWorkOrder) return 'warning';
  return 'ok';
}

function StatusChip({ severity, status, hasOpenWorkOrder }: { severity: Severity; status?: string | null; hasOpenWorkOrder?: boolean }) {
  if (severity === 'destructive') return <Chip tone="bad">Out of service</Chip>;
  if (severity === 'warning') return <Chip tone="warn">{hasOpenWorkOrder && (status || '').toLowerCase() !== 'in_shop' ? 'Open work order' : 'In shop'}</Chip>;
  return <Chip tone="good">Active</Chip>;
}

export function MyEquipmentCard({ driverId, assignedTruck }: MyEquipmentCardProps) {
  const { data: trailerRow } = useQuery({
    queryKey: ['driver-trailer', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailer_assignments')
        .select('id, trailer_id, trailers(id, unit_number, trailer_type, status)')
        .eq('driver_id', driverId)
        .is('released_at', null)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  const trailer = (trailerRow as any)?.trailers ?? null;

  const { data: openWorkOrders = [] } = useQuery({
    queryKey: ['driver-equipment-work-orders', assignedTruck?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, status, service_type')
        .eq('truck_id', assignedTruck!.id)
        .is('deleted_at', null)
        .neq('status', 'completed');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!assignedTruck?.id,
  });

  const truckHasOpenWO = openWorkOrders.length > 0;
  const truckSeverity = assignedTruck ? resolveSeverity(assignedTruck.status, truckHasOpenWO) : 'ok';
  const trailerSeverity = trailer ? resolveSeverity(trailer.status, false) : 'ok';
  const anyCritical = truckSeverity === 'destructive' || trailerSeverity === 'destructive';

  return (
    <div className="space-y-3">
      {anyCritical && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive px-4 py-3 text-destructive-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm font-semibold">Equipment is out of service. Do not dispatch. Contact dispatch now.</p>
        </div>
      )}
      <Panel>
        <PanelHead title="My equipment" />
        <ul className="divide-y divide-border">
          <li className="flex items-center gap-3 px-4 py-3">
            <TruckIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              {assignedTruck ? (
                <>
                  <p className="truncate text-sm font-semibold">Truck {assignedTruck.unit_number || '-'}</p>
                  <p className="truncate text-xs text-muted-foreground">{[assignedTruck.year, assignedTruck.make, assignedTruck.model].filter(Boolean).join(' ') || 'Details unavailable'}</p>
                </>
              ) : (
                <p className="text-sm font-medium text-warning">No truck assigned. Contact dispatch.</p>
              )}
            </div>
            {assignedTruck && <StatusChip severity={truckSeverity} status={assignedTruck.status} hasOpenWorkOrder={truckHasOpenWO} />}
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <Container className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              {trailer ? (
                <>
                  <p className="truncate text-sm font-semibold">Trailer {trailer.unit_number || '-'}</p>
                  <p className="truncate text-xs text-muted-foreground">{trailer.trailer_type || 'Trailer'}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No trailer assigned</p>
              )}
            </div>
            {trailer && <StatusChip severity={trailerSeverity} status={trailer.status} />}
          </li>
        </ul>
      </Panel>
    </div>
  );
}

export default MyEquipmentCard;
