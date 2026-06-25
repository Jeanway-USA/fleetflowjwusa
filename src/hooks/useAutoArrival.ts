import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOptimisticLoadStatus } from '@/hooks/useOptimisticLoadStatus';
import { useGeofenceStatus } from '@/hooks/useGeofenceStatus';

interface Coordinates { lat: number; lng: number }

interface ActiveLoad {
  id: string;
  status: string;
  origin?: string | null;
  destination?: string | null;
  org_id?: string | null;
  landstar_load_id?: string | null;
}

/**
 * Silently auto-advances a load's status when the driver crosses the geofence
 * of either the origin or destination facility. Writes an audit row to
 * load_status_logs with notes describing the geofence trigger.
 */
export function useAutoArrival(
  load: ActiveLoad | null | undefined,
  driverCoords: Coordinates | null,
  onTransition?: () => void,
) {
  const { user } = useAuth();
  const { applyOptimistic } = useOptimisticLoadStatus();
  const firedRef = useRef<Set<string>>(new Set());

  const { atOrigin, atDestination } = useGeofenceStatus(
    driverCoords,
    load?.origin ?? null,
    load?.destination ?? null,
    load?.id ?? null,
    load?.status ?? null,
  );

  useEffect(() => {
    if (!load || !driverCoords) return;

    let nextStatus: string | null = null;
    let trigger: 'origin' | 'destination' | null = null;
    let facility: string | null = null;

    if (atOrigin && (load.status === 'assigned' || load.status === 'pending')) {
      nextStatus = 'loading';
      trigger = 'origin';
      facility = load.origin ?? null;
    } else if (atDestination && load.status === 'in_transit') {
      nextStatus = 'unloading';
      trigger = 'destination';
      facility = load.destination ?? null;
    }

    if (!nextStatus || !trigger) return;

    const fireKey = `${load.id}:${trigger}`;
    if (firedRef.current.has(fireKey)) return;
    firedRef.current.add(fireKey);

    const previousStatus = load.status;
    const { commit, rollback } = applyOptimistic(load.id, { status: nextStatus });

    (async () => {
      const { error: updateErr } = await supabase
        .from('fleet_loads')
        .update({ status: nextStatus })
        .eq('id', load.id)
        .eq('status', previousStatus); // gate so we never go backward

      if (updateErr) {
        firedRef.current.delete(fireKey);
        rollback({ silent: true });
        return;
      }

      // Silent audit log — no toast, no driver prompt.
      await supabase.from('load_status_logs').insert({
        load_id: load.id,
        previous_status: previousStatus,
        new_status: nextStatus,
        changed_by: user?.id ?? null,
        org_id: load.org_id ?? null,
        notes: `Auto-arrival via geofence at ${trigger} facility${facility ? ` (${facility})` : ''}. Driver position: ${driverCoords.lat.toFixed(5)}, ${driverCoords.lng.toFixed(5)}.`,
      });

      commit();
      onTransition?.();
    })();
  }, [
    load?.id,
    load?.status,
    atOrigin,
    atDestination,
    driverCoords?.lat,
    driverCoords?.lng,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
}
