/**
 * OSRM-based routing utility.
 * Fetches real road-following routes and caches them in-memory.
 */

interface Coordinates {
  lat: number;
  lng: number;
}

type LatLngTuple = [number, number];

// In-memory cache keyed by rounded coordinates
const routeCache = new Map<string, LatLngTuple[]>();

function cacheKey(origin: Coordinates, destination: Coordinates): string {
  const oLat = origin.lat.toFixed(4);
  const oLng = origin.lng.toFixed(4);
  const dLat = destination.lat.toFixed(4);
  const dLng = destination.lng.toFixed(4);
  return `${oLat},${oLng}->${dLat},${dLng}`;
}

function straightLine(origin: Coordinates, destination: Coordinates): LatLngTuple[] {
  return [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng],
  ];
}

/**
 * Fetch a driving route from the public OSRM server.
 * Returns an array of [lat, lng] tuples suitable for Leaflet Polyline.
 * Falls back to a straight line on failure.
 */
export async function fetchRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<LatLngTuple[]> {
  const key = cacheKey(origin, destination);

  // Return cached result
  const cached = routeCache.get(key);
  if (cached) return cached;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`OSRM ${response.status}`);

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('No route found');
    }

    // GeoJSON is [lng, lat] — flip to [lat, lng] for Leaflet
    const coords: LatLngTuple[] = data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as LatLngTuple
    );

    routeCache.set(key, coords);
    return coords;
  } catch (error) {
    console.warn('OSRM route fetch failed, using straight line:', error);
    const fallback = straightLine(origin, destination);
    routeCache.set(key, fallback);
    return fallback;
  }
}

/**
 * Fetch routes for multiple origin/destination pairs sequentially
 * with a small delay to respect OSRM rate limits.
 */
export async function fetchRoutesBatch(
  pairs: { id: string; origin: Coordinates; destination: Coordinates }[]
): Promise<Map<string, LatLngTuple[]>> {
  const results = new Map<string, LatLngTuple[]>();

  for (let i = 0; i < pairs.length; i++) {
    const { id, origin, destination } = pairs[i];
    const route = await fetchRoute(origin, destination);
    results.set(id, route);

    // 200ms delay between requests (skip if cached or last item)
    if (i < pairs.length - 1) {
      const key = cacheKey(origin, destination);
      const wasCached = routeCache.has(key);
      if (!wasCached) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  return results;
}
