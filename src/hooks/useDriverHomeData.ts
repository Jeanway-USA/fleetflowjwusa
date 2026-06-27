import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Single source of truth for the driver-home data payload.
 *
 * Both the live mobile Driver Dashboard and the Owner Spectator View consume
 * this hook so that any new column added to `fleet_loads` (PU#, trailer, etc.)
 * automatically flows to both surfaces and they can never drift.
 *
 * Pass:
 *  - `userId` to resolve a driver record via `drivers.user_id` (driver path)
 *  - `driverId` to load a specific driver record directly (spectator path)
 */
export function useDriverHomeData({
  userId,
  driverId,
}: {
  userId?: string | null;
  driverId?: string | null;
}) {
  const driverQuery = useQuery({
    queryKey: ['driver-home/driver', userId ?? null, driverId ?? null],
    queryFn: async () => {
      const base = supabase
        .from('drivers')
        .select('*, trucks!trucks_current_driver_id_fkey(*)');
      const { data, error } = driverId
        ? await base.eq('id', driverId).maybeSingle()
        : await base.eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!(userId || driverId),
  });

  const resolvedDriverId = driverQuery.data?.id;

  const loadsQuery = useQuery({
    queryKey: ['driver-home/loads', resolvedDriverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, trucks(*), load_accessorials(*)')
        .eq('driver_id', resolvedDriverId!)
        .in('status', ['assigned', 'loading', 'in_transit', 'pending'])
        .order('pickup_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!resolvedDriverId,
  });

  const truckQuery = useQuery({
    queryKey: ['driver-home/truck', resolvedDriverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('current_driver_id', resolvedDriverId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!resolvedDriverId,
  });

  const locationQuery = useQuery({
    queryKey: ['driver-home/location', resolvedDriverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('*')
        .eq('driver_id', resolvedDriverId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!resolvedDriverId,
    refetchInterval: 60_000,
  });

  const activeLoads = loadsQuery.data ?? [];
  const activeLoad =
    activeLoads.find((l: any) => l.status === 'in_transit' || l.status === 'loading') ||
    activeLoads[0];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const nextLoad = activeLoads.find(
    (l: any) =>
      l.id !== activeLoad?.id &&
      (l.status === 'assigned' || l.status === 'pending') &&
      l.pickup_date &&
      l.pickup_date >= todayStr,
  );

  return {
    driver: driverQuery.data,
    activeLoads,
    activeLoad,
    nextLoad,
    assignedTruck: truckQuery.data,
    driverLocation: locationQuery.data,
    isLoading: driverQuery.isLoading || loadsQuery.isLoading,
    refetchLoads: loadsQuery.refetch,
  };
}
