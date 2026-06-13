import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck as TruckIcon, Container, AlertTriangle, Wrench } from 'lucide-react';

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

function StatusBadge({ severity, status, hasOpenWorkOrder }: { severity: Severity; status?: string | null; hasOpenWorkOrder?: boolean }) {
  if (severity === 'destructive') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Out of Service — Do Not Dispatch
      </Badge>
    );
  }
  if (severity === 'warning') {
    return (
      <Badge className="gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
        <Wrench className="h-3 w-3" />
        {hasOpenWorkOrder && (status || '').toLowerCase() !== 'in_shop' ? 'Active Work Order' : 'In Shop'}
      </Badge>
    );
  }
  return <Badge variant="secondary">Active</Badge>;
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TruckIcon className="h-4 w-4 text-primary" />
          My Equipment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {anyCritical && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-destructive font-medium">
              Equipment flagged Out of Service — do not dispatch. Contact dispatch immediately.
            </span>
          </div>
        )}

        {/* Truck row */}
        <div className="flex items-center justify-between gap-2 rounded-md border p-2">
          <div className="flex items-center gap-2 min-w-0">
            <TruckIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            {assignedTruck ? (
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">Truck #{assignedTruck.unit_number || '—'}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[assignedTruck.year, assignedTruck.make, assignedTruck.model].filter(Boolean).join(' ') || 'Details unavailable'}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">No truck assigned — contact dispatch</span>
              </div>
            )}
          </div>
          {assignedTruck && (
            <StatusBadge severity={truckSeverity} status={assignedTruck.status} hasOpenWorkOrder={truckHasOpenWO} />
          )}
        </div>

        {/* Trailer row */}
        <div className="flex items-center justify-between gap-2 rounded-md border p-2">
          <div className="flex items-center gap-2 min-w-0">
            <Container className="h-4 w-4 text-muted-foreground shrink-0" />
            {trailer ? (
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">Trailer #{trailer.unit_number || '—'}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {trailer.trailer_type || 'Trailer'}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No trailer assigned</div>
            )}
          </div>
          {trailer && <StatusBadge severity={trailerSeverity} status={trailer.status} />}
        </div>
      </CardContent>
    </Card>
  );
}

export default MyEquipmentCard;
