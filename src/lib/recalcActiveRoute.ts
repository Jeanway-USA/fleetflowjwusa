/**
 * Live route recalculation.
 *
 * Triggered from the driver's GPS watcher. Recalculates the route from the
 * driver's current location to the load's destination using OSRM and persists
 * the geometry on `fleet_loads.current_route_geometry`, which the dispatcher
 * map / driver HUD / public tracker subscribe to in realtime.
 */
import { supabase } from '@/integrations/supabase/client';
import { geocodeLocationAsync } from '@/lib/geocoding';
import { fetchRoute } from '@/lib/routing';

interface LatLng {
  lat: number;
  lng: number;
}

// Per-load runtime state (single tab, single load at a time is the common case).
const lastRecalcOriginByLoad = new Map<string, LatLng>();
const lastRecalcAtByLoad = new Map<string, number>();
const pendingTimerByLoad = new Map<string, ReturnType<typeof setTimeout>>();
const destCacheByLoad = new Map<string, LatLng | null>();

const MIN_DISTANCE_MILES = 0.1;
const MIN_INTERVAL_MS = 20 * 1000; // at most 1 recalc / 20s / load
const DEBOUNCE_MS = 2_500; // coalesce bursts of GPS pings

function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function getDestinationCoords(loadId: string): Promise<LatLng | null> {
  if (destCacheByLoad.has(loadId)) return destCacheByLoad.get(loadId) ?? null;
  const { data, error } = await supabase
    .from('fleet_loads')
    .select('destination')
    .eq('id', loadId)
    .maybeSingle();
  if (error || !data?.destination) {
    destCacheByLoad.set(loadId, null);
    return null;
  }
  const coords = await geocodeLocationAsync(data.destination);
  destCacheByLoad.set(loadId, coords);
  return coords;
}

async function runRecalc(loadId: string, origin: LatLng): Promise<boolean> {
  const destination = await getDestinationCoords(loadId);
  if (!destination) {
    console.warn('[recalcActiveRoute] no destination coords for load', loadId);
    return false;
  }

  const path = await fetchRoute(origin, destination);
  if (!path || path.length < 2) {
    console.warn('[recalcActiveRoute] OSRM returned empty path');
    return false;
  }

  const { data, error } = await supabase
    .from('fleet_loads')
    // Columns exist in the migration; types may regenerate on next build.
    .update({
      current_route_geometry: path as unknown as never,
      current_route_origin: { lat: origin.lat, lng: origin.lng } as unknown as never,
      current_route_updated_at: new Date().toISOString() as unknown as never,
    } as never)
    .eq('id', loadId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('[recalcActiveRoute] update failed:', error.message, error);
    return false;
  }
  if (!data) {
    console.warn('[recalcActiveRoute] update returned no row — RLS blocked or wrong load id?', loadId);
    return false;
  }

  console.info('[recalcActiveRoute] saved live route', { loadId, points: path.length });
  lastRecalcOriginByLoad.set(loadId, origin);
  lastRecalcAtByLoad.set(loadId, Date.now());
  return true;
}

/**
 * Call on every accepted GPS fix while a load is active.
 * Self-throttles by distance + time + debounce so OSRM stays well under rate limits.
 */
export function maybeRecalcRoute(loadId: string | null | undefined, origin: LatLng): void {
  if (!loadId) return;

  const lastOrigin = lastRecalcOriginByLoad.get(loadId);
  const lastAt = lastRecalcAtByLoad.get(loadId) ?? 0;
  const now = Date.now();

  // Distance gate
  if (lastOrigin) {
    const moved = haversineMiles(lastOrigin, origin);
    if (moved < MIN_DISTANCE_MILES) return;
  }
  // Time gate
  if (now - lastAt < MIN_INTERVAL_MS) return;

  // Debounce — collapse bursts of position updates into one call.
  const existing = pendingTimerByLoad.get(loadId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pendingTimerByLoad.delete(loadId);
    runRecalc(loadId, origin).catch((err) =>
      console.warn('[recalcActiveRoute] recalc failed:', err),
    );
  }, DEBOUNCE_MS);
  pendingTimerByLoad.set(loadId, t);
}

/** Reset cached state for a load (e.g. when a driver finishes the load). */
export function resetRecalcState(loadId: string): void {
  lastRecalcOriginByLoad.delete(loadId);
  lastRecalcAtByLoad.delete(loadId);
  destCacheByLoad.delete(loadId);
  const t = pendingTimerByLoad.get(loadId);
  if (t) {
    clearTimeout(t);
    pendingTimerByLoad.delete(loadId);
  }
}
