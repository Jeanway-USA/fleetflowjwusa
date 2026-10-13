import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { featureAllowed } from '@/lib/areas';

/**
 * The areas the signed-in person is limited to, or null when they have no limit. Owners are never limited, and
 * if the limit cannot be read (for example the database update is not applied yet) nothing is hidden.
 */
export function useAreaAccess() {
  const { user, roles } = useAuth();
  const isOwner = roles.includes('owner');
  const { data } = useQuery({
    queryKey: ['area-access', user?.id],
    enabled: !!user?.id && !isOwner,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: row, error } = await (supabase as any)
        .from('user_area_access')
        .select('areas, is_active')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error || !row || !row.is_active) return null;
      return (row.areas ?? []) as string[];
    },
  });
  const areas = isOwner ? null : data ?? null;
  return { areas, allowsFeature: (feature?: string) => featureAllowed(areas, feature) };
}
