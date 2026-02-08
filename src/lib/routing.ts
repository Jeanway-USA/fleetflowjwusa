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
 * Fetch a driving route through multiple waypoints from the public OSRM server.
 * Falls back to fetchRoute(origin, destination) if the multi-waypoint request fails.
 */
export async function fetchRouteWithWaypoints(
  origin: Coordinates,
  waypoints: Coordinates[],
  destination: Coordinates
): Promise<LatLngTuple[]> {
  if (waypoints.length === 0) {
    return fetchRoute(origin, destination);
  }

  const allPoints = [origin, ...waypoints, destination];
  const key = allPoints.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('->');

  const cached = routeCache.get(key);
  if (cached) return cached;

  try {
    const coordString = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`OSRM ${response.status}`);

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('No route found');
    }

    const coords: LatLngTuple[] = data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as LatLngTuple
    );

    routeCache.set(key, coords);
    return coords;
  } catch (error) {
    console.warn('OSRM multi-waypoint route failed, falling back:', error);
    return fetchRoute(origin, destination);
  }
}

/**
 * Fetch routes for multiple origin/destination pairs sequentially
 * with a small delay to respect OSRM rate limits.
 */
export async function fetchRoutesBatch(
  pairs: { id: string; origin: Coordinates; destination: Coordinates; waypoints?: Coordinates[] }[]
): Promise<Map<string, LatLngTuple[]>> {
  const results = new Map<string, LatLngTuple[]>();

  for (let i = 0; i < pairs.length; i++) {
    const { id, origin, destination, waypoints } = pairs[i];
    const route = waypoints && waypoints.length > 0
      ? await fetchRouteWithWaypoints(origin, waypoints, destination)
      : await fetchRoute(origin, destination);
    results.set(id, route);

    // 200ms delay between requests (skip if last item)
    if (i < pairs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}
