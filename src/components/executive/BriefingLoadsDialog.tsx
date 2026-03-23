import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, FileWarning } from 'lucide-react';

interface BriefingLoadsDialogProps {
  type: 'pickup-today' | 'missing-pod';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BriefingLoadsDialog({ type, open, onOpenChange }: BriefingLoadsDialogProps) {
  const { orgId } = useAuth();

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['briefing-loads', type, orgId],
    queryFn: async () => {
      if (!orgId) return [];

      if (type === 'pickup-today') {
        const today = format(new Date(), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('fleet_loads')
          .select('id, landstar_load_id, origin, destination, pickup_date, pickup_time, status, driver_id, drivers(first_name, last_name)')
          .eq('org_id', orgId)
          .eq('pickup_date', today)
          .in('status', ['assigned', 'booked'])
          .order('pickup_time', { ascending: true });
        if (error) throw error;
        return data ?? [];
      }

      // missing-pod: delivered loads with pod_required=true that have no POD data
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, delivery_date, status, driver_id, drivers(first_name, last_name)')
        .eq('org_id', orgId)
        .eq('status', 'delivered')
        .eq('pod_required', true)
        .is('pod_signature_path', null)
        .is('pod_transflo_link', null)
        .order('delivery_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!orgId,
  });

  const title = type === 'pickup-today' ? 'Loads Picking Up Today' : 'Delivered Loads Missing PODs';
  const Icon = type === 'pickup-today' ? Truck : FileWarning;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
            <Badge variant="secondary" className="ml-2">{loads.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : loads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No loads found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Load #</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>{type === 'pickup-today' ? 'Pickup' : 'Delivered'}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loads.map((load: any) => {
                const driver = load.drivers;
                const driverName = driver ? `${driver.first_name} ${driver.last_name}` : '—';
                const dateVal = type === 'pickup-today' ? load.pickup_date : load.delivery_date;

                return (
                  <TableRow key={load.id}>
                    <TableCell className="font-medium">
                      {load.landstar_load_id || load.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {load.origin} → {load.destination}
                    </TableCell>
                    <TableCell className="text-sm">{driverName}</TableCell>
                    <TableCell className="text-sm">
                      {dateVal ? format(new Date(dateVal + 'T00:00:00'), 'MMM d') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {load.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
