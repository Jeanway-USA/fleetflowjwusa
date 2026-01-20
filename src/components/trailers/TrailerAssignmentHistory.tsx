import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, User, Truck } from 'lucide-react';

interface TrailerAssignmentHistoryProps {
  trailerId: string;
}

interface Assignment {
  id: string;
  assigned_at: string;
  released_at: string | null;
  driver_id: string | null;
  truck_id: string | null;
  created_at: string;
}

export function TrailerAssignmentHistory({ trailerId }: TrailerAssignmentHistoryProps) {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['trailer-assignments', trailerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailer_assignments')
        .select('*')
        .eq('trailer_id', trailerId)
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
  });

  // Fetch driver names
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-for-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch truck unit numbers
  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks-for-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('id, unit_number');
      if (error) throw error;
      return data;
    },
  });

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '-';
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : 'Unknown';
  };

  const getTruckUnit = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck ? truck.unit_number : 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-8">
        No assignment history found for this trailer.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assigned</TableHead>
          <TableHead>Released</TableHead>
          <TableHead>
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" /> Driver
            </div>
          </TableHead>
          <TableHead>
            <div className="flex items-center gap-1">
              <Truck className="h-4 w-4" /> Truck
            </div>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell>{format(new Date(assignment.assigned_at), 'MMM d, yyyy h:mm a')}</TableCell>
            <TableCell>
              {assignment.released_at 
                ? format(new Date(assignment.released_at), 'MMM d, yyyy h:mm a')
                : <span className="text-primary font-medium">Active</span>
              }
            </TableCell>
            <TableCell>{getDriverName(assignment.driver_id)}</TableCell>
            <TableCell>{getTruckUnit(assignment.truck_id)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
