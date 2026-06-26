import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to realtime changes on `driver_settlements` (and child items)
 * for the given driver and invalidates the cached settlement queries.
 *
 * Ensures the driver dashboard reflects admin deletes / status changes
 * (e.g. revert to draft) instantly, with no manual refresh required.
 */
export function useDriverSettlementsRealtime(driverId: string | undefined | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!driverId || !enabled) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['my-paystubs', driverId] });
      queryClient.invalidateQueries({ queryKey: ['paystub-items'] });
      queryClient.invalidateQueries({ queryKey: ['driver-weekly-loads', driverId] });
    };

    const channel = supabase
      .channel(`driver-settlements-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_settlements',
          filter: `driver_id=eq.${driverId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_settlement_items',
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, enabled, queryClient]);
}
