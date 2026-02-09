/**
 * IFTA Route Analysis Utility
 * 
 * Analyzes OSRM route geometry to determine miles driven per US state.
 * Uses route polyline sampling + Nominatim reverse geocoding.
 */

import { geocodeLocationAsync } from '@/lib/geocoding';
import { fetchRouteWithWaypoints } from '@/lib/routing';
import { parseIntermediateStops } from '@/lib/parseIntermediateStops';
import { US_STATES } from '@/lib/us-states';

type LatLngTuple = [number, number];

// Cache for reverse geocode state lookups (lat,lng -> state code)
const reverseGeocodeCache = new Map<string, string | null>();

// Rate limiter for Nominatim (1 req/sec)
let lastReverseGeoTime = 0;
const REVERSE_GEO_INTERVAL = 1100;

/**
 * Reverse-geocode a lat/lng point to a US state abbreviation.
 */
async function reverseGeocodeState(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (reverseGeocodeCache.has(key)) {
    return reverseGeocodeCache.get(key) || null;
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastReverseGeoTime;
  if (elapsed < REVERSE_GEO_INTERVAL) {
    await new Promise(r => setTimeout(r, REVERSE_GEO_INTERVAL - elapsed));
  }
  lastReverseGeoTime = Date.now();

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=5&addressdetails=1`,
      { headers: { 'User-Agent': 'FleetManagementApp/1.0' } }
    );

    if (!response.ok) {
      reverseGeocodeCache.set(key, null);
      return null;
    }

    const data = await response.json();
    const stateCode = data?.address?.['ISO3166-2-lvl4'];
    
    if (stateCode && stateCode.startsWith('US-')) {
      const abbr = stateCode.replace('US-', '');
      if ((US_STATES as readonly string[]).includes(abbr)) {
        reverseGeocodeCache.set(key, abbr);
        return abbr;
      }
    }

    // Fallback: try state field
    const stateName = data?.address?.state;
    if (stateName) {
      const abbr = stateNameToAbbr(stateName);
      if (abbr) {
        reverseGeocodeCache.set(key, abbr);
        return abbr;
      }
    }

    reverseGeocodeCache.set(key, null);
    return null;
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
    reverseGeocodeCache.set(key, null);
    return null;
  }
}

/**
 * Calculate the Haversine distance between two lat/lng points in miles.
 */
function haversineDistanceMiles(a: LatLngTuple, b: LatLngTuple): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Sample points along a polyline at regular distance intervals.
 * Returns sampled lat/lng points.
 */
function sampleRoutePoints(
  coords: LatLngTuple[],
  intervalMiles: number
): LatLngTuple[] {
  if (coords.length < 2) return coords;

  const samples: LatLngTuple[] = [coords[0]];
  let accumulated = 0;
  let nextSampleAt = intervalMiles;

  for (let i = 1; i < coords.length; i++) {
    const segDist = haversineDistanceMiles(coords[i - 1], coords[i]);
    accumulated += segDist;

    while (accumulated >= nextSampleAt && i < coords.length) {
      // Interpolate to find the exact sample point
      const overshoot = accumulated - nextSampleAt;
      const ratio = segDist > 0 ? 1 - overshoot / segDist : 1;
      const sampleLat = coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * ratio;
      const sampleLng = coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * ratio;
      samples.push([sampleLat, sampleLng]);
      nextSampleAt += intervalMiles;
    }
  }

  // Always include the last point
  const lastCoord = coords[coords.length - 1];
  if (
    samples.length === 0 ||
    haversineDistanceMiles(samples[samples.length - 1], lastCoord) > 1
  ) {
    samples.push(lastCoord);
  }

  return samples;
}

/**
 * Analyze an OSRM route to determine miles per US state.
 * Samples the route at ~50-mile intervals and reverse-geocodes each sample.
 * Returns a Record mapping state abbreviations to miles.
 */
export async function analyzeRouteStates(
  coords: LatLngTuple[],
  totalMiles: number,
  onProgress?: (message: string) => void
): Promise<Record<string, number>> {
  if (coords.length < 2 || totalMiles <= 0) return {};

  // Sample every ~50 miles (minimum 3 samples for short routes)
  const intervalMiles = Math.max(20, Math.min(50, totalMiles / 5));
  const samples = sampleRoutePoints(coords, intervalMiles);

  if (samples.length < 2) return {};

  // Reverse-geocode each sample to get its state
  const sampleStates: (string | null)[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (onProgress) {
      onProgress(`Identifying states: ${i + 1}/${samples.length} points`);
    }
    const state = await reverseGeocodeState(samples[i][0], samples[i][1]);
    sampleStates.push(state);
  }

  // Calculate distance-weighted state allocation
  const stateDistances: Record<string, number> = {};
  let totalSampledDist = 0;

  for (let i = 1; i < samples.length; i++) {
    const dist = haversineDistanceMiles(samples[i - 1], samples[i]);
    totalSampledDist += dist;

    // Use the state of the midpoint between consecutive samples
    // Prefer the current segment's state; fall back to previous
    const state = sampleStates[i] || sampleStates[i - 1];
    if (state) {
      stateDistances[state] = (stateDistances[state] || 0) + dist;
    }
  }

  // Scale sampled distances to match the actual total miles
  if (totalSampledDist > 0) {
    const scale = totalMiles / totalSampledDist;
    for (const state of Object.keys(stateDistances)) {
      stateDistances[state] = Math.round(stateDistances[state] * scale);
    }
  }

  return stateDistances;
}

/**
 * Analyze a single load to get per-state mile breakdown.
 * Geocodes origin/destination, fetches OSRM route, samples for states.
 */
export async function analyzeLoadRoute(
  origin: string,
  destination: string,
  totalMiles: number,
  notes: string | null,
  onProgress?: (message: string) => void
): Promise<Record<string, number> | null> {
  try {
    // Geocode origin and destination
    if (onProgress) onProgress('Geocoding addresses...');
    const [originCoords, destCoords] = await Promise.all([
      geocodeLocationAsync(origin),
      geocodeLocationAsync(destination),
    ]);

    if (!originCoords || !destCoords) {
      console.warn('Could not geocode origin/destination for IFTA route analysis');
      return null;
    }

    // Parse intermediate stops
    const intermediateStops = parseIntermediateStops(notes);
    const waypoints: { lat: number; lng: number }[] = [];

    if (intermediateStops.length > 0) {
      if (onProgress) onProgress('Geocoding intermediate stops...');
      for (const stop of intermediateStops) {
        const stopCoords = await geocodeLocationAsync(stop.address);
        if (stopCoords) {
          waypoints.push(stopCoords);
        }
      }
    }

    // Fetch OSRM route
    if (onProgress) onProgress('Fetching route...');
    const routeCoords = await fetchRouteWithWaypoints(
      originCoords,
      waypoints,
      destCoords
    );

    if (routeCoords.length < 2) {
      console.warn('Route too short for state analysis');
      return null;
    }

    // Analyze states along the route
    return await analyzeRouteStates(routeCoords, totalMiles, onProgress);
  } catch (err) {
    console.error('Load route analysis failed:', err);
    return null;
  }
}

// Helpers: US state name -> abbreviation
const STATE_NAME_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

function stateNameToAbbr(name: string): string | null {
  return STATE_NAME_MAP[name.toLowerCase().trim()] || null;
}
