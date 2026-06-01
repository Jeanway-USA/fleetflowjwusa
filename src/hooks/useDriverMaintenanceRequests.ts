import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeChannel } from '@/lib/safe-channel';

export interface DriverMaintenanceRequest {
  id: string;
  issue_type: string;
  description: string;
  priority: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  trucks?: { unit_number: string } | null;
}

export function useDriverMaintenanceRequests(driverId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['driver-maintenance-requests', driverId],
    enabled: !!driverId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DriverMaintenanceRequest[]> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('id, issue_type, description, priority, status, admin_notes, created_at, trucks(unit_number)')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DriverMaintenanceRequest[];
    },
  });

  useEffect(() => {
    if (!driverId) return;
    return safeChannel(`driver-mr-${driverId}`, (ch) =>
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'maintenance_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['driver-maintenance-requests', driverId] });
        }
      ),
    );
  }, [driverId, qc]);

  return query;
}
