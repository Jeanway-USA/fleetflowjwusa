import { useQuery } from '@tanstack/react-query';
import { format, subYears } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { fetchSafetyFiles } from '@/lib/safety/files';

const db = supabase as any;
export const SAFETY_KEY = ['safety'];

/** Everything the Safety page reads, loaded once and shared by its tabs. */
export function useSafetyData() {
  const drivers = useQuery({
    queryKey: [...SAFETY_KEY, 'drivers'],
    queryFn: async () => {
      const { data, error } = await db.from('drivers').select('*').is('deleted_at', null).order('last_name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const trucks = useQuery({
    queryKey: [...SAFETY_KEY, 'trucks'],
    queryFn: async () => {
      const { data, error } = await db.from('trucks').select('*').is('deleted_at', null).order('unit_number');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const trailers = useQuery({
    queryKey: [...SAFETY_KEY, 'trailers'],
    queryFn: async () => {
      const { data, error } = await db.from('trailers').select('*').is('deleted_at', null).order('unit_number');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  // Three years, because the accident register is kept that long.
  const incidents = useQuery({
    queryKey: [...SAFETY_KEY, 'incidents'],
    queryFn: async () => {
      const since = format(subYears(new Date(), 3), 'yyyy-MM-dd');
      const { data, error } = await db.from('incidents').select('id, incident_date, incident_type, severity, status, injuries_reported, citation_issued, driver_id, truck_id, description').is('deleted_at', null).gte('incident_date', since).order('incident_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const files = useQuery({ queryKey: [...SAFETY_KEY, 'files'], queryFn: fetchSafetyFiles });
  return {
    drivers: drivers.data ?? [],
    trucks: trucks.data ?? [],
    trailers: trailers.data ?? [],
    incidents: incidents.data ?? [],
    files: files.data?.files ?? [],
    filesReady: files.data?.ready ?? true,
    loading: drivers.isLoading || trucks.isLoading || trailers.isLoading || incidents.isLoading || files.isLoading,
    error: (drivers.error || trucks.error || trailers.error || incidents.error) as Error | null,
  };
}
