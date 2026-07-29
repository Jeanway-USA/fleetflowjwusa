// Geocoding utility.
// Precision-first cascade: Mapbox (full street address, via edge function)
// -> Nominatim structured full address -> Nominatim city/state -> hardcoded city.
// Includes caching to minimize API calls and respect rate limits.

import { supabase } from '@/integrations/supabase/client';

interface Coordinates {
  lat: number;
  lng: number;
}

export type GeocodePrecision = 'address' | 'city';

// Cache for geocoded addresses (persists during session)
const geocodeCache = new Map<string, Coordinates | null>();
const precisionCache = new Map<string, GeocodePrecision>();
// De-dupe concurrent lookups for the same address
const inflight = new Map<string, Promise<Coordinates | null>>();

// Queue for rate limiting (Nominatim allows 1 request per second)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds between requests


// Fallback coordinates for common cities (used if API fails or for quick lookups)
const cityFallbacks: Record<string, Coordinates> = {
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.0740 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'atlanta': { lat: 33.7490, lng: -84.3880 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'memphis': { lat: 35.1495, lng: -90.0490 },
  'nashville': { lat: 36.1627, lng: -86.7816 },
  'denver': { lat: 39.7392, lng: -104.9903 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'boston': { lat: 42.3601, lng: -71.0589 },
  'detroit': { lat: 42.3314, lng: -83.0458 },
  'minneapolis': { lat: 44.9778, lng: -93.2650 },
  'charlotte': { lat: 35.2271, lng: -80.8431 },
  'indianapolis': { lat: 39.7684, lng: -86.1581 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'columbus': { lat: 39.9612, lng: -82.9988 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'kansas city': { lat: 39.0997, lng: -94.5786 },
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'oklahoma city': { lat: 35.4676, lng: -97.5164 },
  'portland': { lat: 45.5152, lng: -122.6784 },
  'little rock': { lat: 34.7465, lng: -92.2896 },
  'new orleans': { lat: 29.9511, lng: -90.0715 },
  'birmingham': { lat: 33.5207, lng: -86.8025 },
  'salt lake city': { lat: 40.7608, lng: -111.8910 },
  'el paso': { lat: 31.7619, lng: -106.4850 },
  'louisville': { lat: 38.2527, lng: -85.7585 },
  'olive branch': { lat: 34.9618, lng: -89.8295 },
  'lancaster': { lat: 32.5921, lng: -96.7561 },
};

// Normalize address for cache key
function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Extract just City, State from a full address for simpler geocoding
// Example: "Roku Olive Branch, 8955 Hacks Cross Rd, Olive Branch, MS 38654" 
//       -> "Olive Branch, MS"
function extractCityState(address: string): string {
  const parts = address.split(',').map(p => p.trim());
  
  if (parts.length < 2) {
    return address;
  }
  
  // Look for the state abbreviation pattern (2 uppercase letters)
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    // Match state abbreviation, possibly followed by zip code
    const stateMatch = part.match(/^([A-Z]{2})(\s+\d{5}(-\d{4})?)?$/);
    if (stateMatch) {
      // State found - get the city (should be the previous part)
      const state = stateMatch[1];
      const city = i > 0 ? parts[i - 1].trim() : '';
      if (city) {
        return `${city}, ${state}`;
      }
      return state;
    }
    
    // Also check for "City, ST 12345" format where state and zip are together
    const cityStateMatch = part.match(/^(.+?)\s+([A-Z]{2})(\s+\d{5}(-\d{4})?)?$/);
    if (cityStateMatch) {
      return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
    }
  }
  
  // Fallback: look for any 2-letter state code in the address
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    const stateMatch = part.match(/\b([A-Z]{2})\b/);
    if (stateMatch) {
      const state = stateMatch[1];
      // City is likely the part before or the beginning of this part
      const beforeState = part.replace(stateMatch[0], '').replace(/\d+/g, '').trim();
      const city = beforeState || (i > 0 ? parts[i - 1].trim() : '');
      if (city && !/^\d/.test(city)) {
        return `${city}, ${state}`;
      }
      return `${city || parts[0]}, ${state}`;
    }
  }
  
  // Couldn't parse - return first two parts
  return parts.slice(0, 2).join(', ');
}

// Extract city name from address for fallback lookup
function extractCityFromAddress(address: string): string | null {
  const normalized = normalizeAddress(address);
  
  // Try to find a known city in the address
  for (const city of Object.keys(cityFallbacks)) {
    if (normalized.includes(city)) {
      return city;
    }
  }
  
  return null;
}

// Split a full US address string into structured pieces so Nominatim can match
// the street rather than only the city.
// "Set Epes Yard, 4455 Lansing Dr, Winston Salem, NC 27105-2924"
//   -> { street: '4455 Lansing Dr', city: 'Winston Salem', state: 'NC', postal: '27105' }
function parseAddressParts(address: string): {
  street?: string;
  city?: string;
  state?: string;
  postal?: string;
} {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  let state: string | undefined;
  let postal: string | undefined;
  let stateIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/);
    if (m) {
      state = m[1].toUpperCase();
      postal = m[2];
      stateIdx = i;
      break;
    }
    const m2 = parts[i].match(/^(.+?)\s+([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/);
    if (m2) {
      state = m2[2].toUpperCase();
      postal = m2[3];
      stateIdx = i;
      break;
    }
  }

  if (stateIdx === -1) return {};

  const city = stateIdx > 0 ? parts[stateIdx - 1] : undefined;
  // The street is the part before the city that starts with a house number.
  let street: string | undefined;
  for (let i = stateIdx - 2; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      street = parts[i];
      break;
    }
  }
  return { street, city, state, postal };
}

// Shared Nominatim rate limiter (1 req/sec policy)
async function throttleNominatim() {
  const timeSince = Date.now() - lastRequestTime;
  if (timeSince < MIN_REQUEST_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL - timeSince));
  }
  lastRequestTime = Date.now();
}

async function nominatimQuery(params: Record<string, string>): Promise<Coordinates | null> {
  await throttleNominatim();
  try {
    const qs = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'us', ...params });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${qs.toString()}`, {
      headers: { 'User-Agent': 'FleetManagementApp/1.0' },
    });
    if (!response.ok) {
      console.warn(`Nominatim API error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// Step 1: Mapbox forward geocoding on the FULL address (via authenticated edge function)
async function geocodeWithMapbox(
  address: string,
): Promise<{ coords: Coordinates; precision: GeocodePrecision } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { addresses: [address] },
    });
    if (error) {
      console.warn('geocode-address failed:', error.message);
      return null;
    }
    const result = data?.results?.[0];
    if (result && Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
      return {
        coords: { lat: Number(result.lat), lng: Number(result.lng) },
        precision: result.precision === 'address' ? 'address' : 'city',
      };
    }
    return null;
  } catch (err) {
    console.warn('geocode-address unavailable:', err);
    return null;
  }
}

// Step 2: Nominatim on the full structured address (street-level)
async function geocodeStructuredWithNominatim(address: string): Promise<Coordinates | null> {
  const { street, city, state, postal } = parseAddressParts(address);
  if (!street || !city || !state) return null;
  return nominatimQuery({
    street,
    city,
    state,
    ...(postal ? { postalcode: postal } : {}),
  });
}

// Step 3: Nominatim on City, State only (legacy behavior — centroid)
async function geocodeCityStateWithNominatim(address: string): Promise<Coordinates | null> {
  const cityState = extractCityState(address);
  return nominatimQuery({ q: cityState });
}

// Main geocoding function - synchronous for backward compatibility
// Returns cached result or fallback; use geocodeLocationAsync for full address support
export function geocodeLocation(location: string): Coordinates | null {
  const cacheKey = normalizeAddress(location);
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }
  
  // Trigger async geocoding for future use (precise path)
  geocodeLocationAsync(location).catch(console.error);
  
  // Return null for now - will be cached for next time
  return null;
}

/** Precision of the last resolved lookup for an address ('address' = street-level). */
export function getGeocodePrecision(location: string): GeocodePrecision | null {
  return precisionCache.get(normalizeAddress(location)) ?? null;
}

// Async geocoding function with full address support
export async function geocodeLocationAsync(location: string): Promise<Coordinates | null> {
  const cacheKey = normalizeAddress(location);

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const run = (async (): Promise<Coordinates | null> => {
    // 1. Mapbox on the full street address
    const mapbox = await geocodeWithMapbox(location);
    if (mapbox) {
      geocodeCache.set(cacheKey, mapbox.coords);
      precisionCache.set(cacheKey, mapbox.precision);
      return mapbox.coords;
    }

    // 2. Nominatim structured full address
    const structured = await geocodeStructuredWithNominatim(location);
    if (structured) {
      geocodeCache.set(cacheKey, structured);
      precisionCache.set(cacheKey, 'address');
      return structured;
    }

    // 3. Nominatim City, State (centroid)
    const cityState = await geocodeCityStateWithNominatim(location);
    if (cityState) {
      geocodeCache.set(cacheKey, cityState);
      precisionCache.set(cacheKey, 'city');
      return cityState;
    }

    // 4. Hardcoded city fallback
    const city = extractCityFromAddress(location);
    if (city && cityFallbacks[city]) {
      geocodeCache.set(cacheKey, cityFallbacks[city]);
      precisionCache.set(cacheKey, 'city');
      return cityFallbacks[city];
    }

    geocodeCache.set(cacheKey, null);
    console.warn(`Could not geocode location: ${location}`);
    return null;
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}


// Batch geocode multiple addresses (respects rate limits)
export async function geocodeBatch(locations: string[]): Promise<Map<string, Coordinates | null>> {
  const results = new Map<string, Coordinates | null>();
  
  for (const location of locations) {
    const coords = await geocodeLocationAsync(location);
    results.set(location, coords);
  }
  
  return results;
}

// Calculate position along route based on progress (0-1)
export function interpolatePosition(
  origin: Coordinates,
  destination: Coordinates,
  progress: number
): Coordinates {
  return {
    lat: origin.lat + (destination.lat - origin.lat) * progress,
    lng: origin.lng + (destination.lng - origin.lng) * progress,
  };
}

// Get progress estimate based on load status
export function getProgressFromStatus(status: string): number {
  switch (status) {
    case 'booked':
    case 'assigned':
      return 0;
    case 'loading':
      return 0.1;
    case 'in_transit':
      return 0.5; // Fixed midpoint estimate
    case 'unloading':
      return 0.95;
    case 'delivered':
    case 'completed':
      return 1;
    default:
      return 0;
  }
}

// Clear the geocode cache (useful for testing or memory management)
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}

// Get cache size for debugging
export function getGeocacheCacheSize(): number {
  return geocodeCache.size;
}
