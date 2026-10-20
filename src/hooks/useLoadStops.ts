import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { IntermediateStopLike } from '@/lib/driver/load';

export interface LoadStop extends IntermediateStopLike {
  load_id: string;
  remaining_hos: number | null;
}

/** The structured intermediate stops of a load, in order. The same query key the old timeline used, so cached data carries over. */
export function useLoadStops(loadId: string | null | undefined) {
  return useQuery({
    queryKey: ['load-intermediate-stops', loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_intermediate_stops')
        .select('*')
        .eq('load_id', loadId!)
        .order('stop_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LoadStop[];
    },
    enabled: !!loadId,
    staleTime: 60_000,
  });
}
