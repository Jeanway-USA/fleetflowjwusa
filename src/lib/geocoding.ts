// Geocoding utility using Nominatim (OpenStreetMap) API
// Includes caching to minimize API calls and respect rate limits

interface Coordinates {
  lat: number;
  lng: number;
}

// Cache for geocoded addresses (persists during session)
const geocodeCache = new Map<string, Coordinates | null>();

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

// Geocode using Nominatim API
async function geocodeWithNominatim(address: string): Promise<Coordinates | null> {
// Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  // Extract just City, State for simpler geocoding
  const cityState = extractCityState(address);
  console.log(`Geocoding: "${address}" -> simplified: "${cityState}"`);

  try {
    const encodedAddress = encodeURIComponent(cityState);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`,
      {
        headers: {
          'User-Agent': 'FleetManagementApp/1.0',
        },
      }
    );

    if (!response.ok) {
      console.warn(`Nominatim API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// Main geocoding function - synchronous for backward compatibility
// Returns cached result or fallback; use geocodeLocationAsync for full address support
export function geocodeLocation(location: string): Coordinates | null {
  const cacheKey = normalizeAddress(location);
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }
  
  // Try city fallback for synchronous return
  const city = extractCityFromAddress(location);
  if (city && cityFallbacks[city]) {
    geocodeCache.set(cacheKey, cityFallbacks[city]);
    return cityFallbacks[city];
  }
  
  // Trigger async geocoding for future use
  geocodeLocationAsync(location).catch(console.error);
  
  // Return null for now - will be cached for next time
  return null;
}

// Async geocoding function with full address support
export async function geocodeLocationAsync(location: string): Promise<Coordinates | null> {
  const cacheKey = normalizeAddress(location);
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }
  
  // Try Nominatim API for full address geocoding
  const coords = await geocodeWithNominatim(location);
  
  if (coords) {
    geocodeCache.set(cacheKey, coords);
    return coords;
  }
  
  // Fallback to city lookup if API fails
  const city = extractCityFromAddress(location);
  if (city && cityFallbacks[city]) {
    geocodeCache.set(cacheKey, cityFallbacks[city]);
    return cityFallbacks[city];
  }
  
  // Cache the null result to avoid repeated failed lookups
  geocodeCache.set(cacheKey, null);
  console.warn(`Could not geocode location: ${location}`);
  return null;
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
