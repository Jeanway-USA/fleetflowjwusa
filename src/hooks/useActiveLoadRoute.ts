import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type LatLng = [number, number];

interface UseActiveLoadRouteResult {
  /** Path from the driver's last GPS fix to the destination, or null if none yet. */
  geometry: LatLng[] | null;
  /** True when geometry was sourced from the DB (live recalc), false when still falling back to static. */
  isLive: boolean;
  /** ISO timestamp of the last recalc, when available. */
  updatedAt: string | null;
}

function normalize(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const out: LatLng[] = [];
  for (const item of value) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0]);
      const lng = Number(item[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
    }
  }
  return out.length >= 2 ? out : null;
}

/**
 * Subscribes to live-recalculated route geometry on `fleet_loads` for a single load.
 * Used by the dispatcher map, driver HUD, and public tracker so the route line
 * redraws as the driver moves.
 */
export function useActiveLoadRoute(loadId: string | null | undefined): UseActiveLoadRouteResult {
  const [geometry, setGeometry] = useState<LatLng[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!loadId) {
      setGeometry(null);
      setUpdatedAt(null);
      return;
    }

    let cancelled = false;

    // Initial fetch
    supabase
      .from('fleet_loads')
      .select('current_route_geometry, current_route_updated_at')
      .eq('id', loadId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next = normalize((data as Record<string, unknown>).current_route_geometry);
        setGeometry(next);
        const ts = (data as Record<string, unknown>).current_route_updated_at;
        setUpdatedAt(typeof ts === 'string' ? ts : null);
      });

    // Realtime subscription — guarded so a wss handshake failure (common on
    // mobile carriers / Safari) can never bubble out of the hook and crash
    // the component tree that hosts the Active Load card.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`active-load-route:${loadId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'fleet_loads',
            filter: `id=eq.${loadId}`,
          },
          (payload) => {
            const next = normalize(
              (payload.new as Record<string, unknown>)?.current_route_geometry,
            );
            if (next) setGeometry(next);
            const ts = (payload.new as Record<string, unknown>)?.current_route_updated_at;
            if (typeof ts === 'string') setUpdatedAt(ts);
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Non-fatal — initial REST fetch already populated geometry.
            console.warn('[useActiveLoadRoute] realtime status:', status);
          }
        });
    } catch (err) {
      console.warn('[useActiveLoadRoute] realtime subscribe failed:', err);
    }

    return () => {
      cancelled = true;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [loadId]);

  return {
    geometry,
    isLive: !!geometry && !!updatedAt,
    updatedAt,
  };
}
