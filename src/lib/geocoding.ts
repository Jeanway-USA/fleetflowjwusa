// Simple geocoding utility for common US cities
// In production, you'd use a geocoding API like Nominatim, Google, or Mapbox

interface Coordinates {
  lat: number;
  lng: number;
}

// Common US cities with approximate coordinates
const cityCoordinates: Record<string, Coordinates> = {
  // Major cities
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.0740 },
  'philadelphia': { lat: 39.9526, lng: -75.1652 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'san jose': { lat: 37.3382, lng: -121.8863 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'fort worth': { lat: 32.7555, lng: -97.3308 },
  'columbus': { lat: 39.9612, lng: -82.9988 },
  'charlotte': { lat: 35.2271, lng: -80.8431 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'denver': { lat: 39.7392, lng: -104.9903 },
  'boston': { lat: 42.3601, lng: -71.0589 },
  'el paso': { lat: 31.7619, lng: -106.4850 },
  'detroit': { lat: 42.3314, lng: -83.0458 },
  'nashville': { lat: 36.1627, lng: -86.7816 },
  'memphis': { lat: 35.1495, lng: -90.0490 },
  'portland': { lat: 45.5152, lng: -122.6784 },
  'oklahoma city': { lat: 35.4676, lng: -97.5164 },
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'louisville': { lat: 38.2527, lng: -85.7585 },
  'baltimore': { lat: 39.2904, lng: -76.6122 },
  'milwaukee': { lat: 43.0389, lng: -87.9065 },
  'albuquerque': { lat: 35.0844, lng: -106.6504 },
  'tucson': { lat: 32.2226, lng: -110.9747 },
  'fresno': { lat: 36.7378, lng: -119.7871 },
  'sacramento': { lat: 38.5816, lng: -121.4944 },
  'kansas city': { lat: 39.0997, lng: -94.5786 },
  'atlanta': { lat: 33.7490, lng: -84.3880 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'orlando': { lat: 28.5383, lng: -81.3792 },
  'tampa': { lat: 27.9506, lng: -82.4572 },
  'st louis': { lat: 38.6270, lng: -90.1994 },
  'minneapolis': { lat: 44.9778, lng: -93.2650 },
  'pittsburgh': { lat: 40.4406, lng: -79.9959 },
  'cleveland': { lat: 41.4993, lng: -81.6944 },
  'cincinnati': { lat: 39.1031, lng: -84.5120 },
  'indianapolis': { lat: 39.7684, lng: -86.1581 },
  'new orleans': { lat: 29.9511, lng: -90.0715 },
  'salt lake city': { lat: 40.7608, lng: -111.8910 },
  'raleigh': { lat: 35.7796, lng: -78.6382 },
  'richmond': { lat: 37.5407, lng: -77.4360 },
  'buffalo': { lat: 42.8864, lng: -78.8784 },
  'birmingham': { lat: 33.5207, lng: -86.8025 },
  'omaha': { lat: 41.2565, lng: -95.9345 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'laredo': { lat: 27.5036, lng: -99.5075 },
  'mcallen': { lat: 26.2034, lng: -98.2300 },
  // States for partial matches
  'tx': { lat: 31.9686, lng: -99.9018 },
  'ca': { lat: 36.7783, lng: -119.4179 },
  'ny': { lat: 42.1657, lng: -74.9481 },
  'fl': { lat: 27.6648, lng: -81.5158 },
  'il': { lat: 40.6331, lng: -89.3985 },
  'pa': { lat: 41.2033, lng: -77.1945 },
  'oh': { lat: 40.4173, lng: -82.9071 },
  'ga': { lat: 32.1656, lng: -82.9001 },
  'nc': { lat: 35.7596, lng: -79.0193 },
  'mi': { lat: 44.3148, lng: -85.6024 },
};

// Extract city name from location string (e.g., "Houston, TX" -> "houston")
function extractCityName(location: string): string {
  // Remove state abbreviations and clean up
  const cleaned = location
    .toLowerCase()
    .replace(/,?\s*(tx|ca|ny|fl|il|pa|oh|ga|nc|mi|wa|az|nv|co|or|tn|mo|md|wi|mn|la|ky|ok|ut|nm|al|sc|va|in|ma|ct|nj)$/i, '')
    .trim();
  
  return cleaned;
}

// Get coordinates for a location string
export function geocodeLocation(location: string): Coordinates | null {
  const cityName = extractCityName(location);
  
  // Try exact match first
  if (cityCoordinates[cityName]) {
    return cityCoordinates[cityName];
  }
  
  // Try partial match
  for (const [city, coords] of Object.entries(cityCoordinates)) {
    if (cityName.includes(city) || city.includes(cityName)) {
      return coords;
    }
  }
  
  // Try to match state abbreviation
  const stateMatch = location.match(/,?\s*(tx|ca|ny|fl|il|pa|oh|ga|nc|mi|wa|az|nv|co|or|tn|mo|md|wi|mn|la|ky|ok|ut|nm|al|sc|va|in|ma|ct|nj)$/i);
  if (stateMatch) {
    const state = stateMatch[1].toLowerCase();
    if (cityCoordinates[state]) {
      // Add some random offset to prevent overlapping
      return {
        lat: cityCoordinates[state].lat + (Math.random() - 0.5) * 2,
        lng: cityCoordinates[state].lng + (Math.random() - 0.5) * 2,
      };
    }
  }
  
  // Default to center of continental US with random offset
  return {
    lat: 39.8283 + (Math.random() - 0.5) * 10,
    lng: -98.5795 + (Math.random() - 0.5) * 20,
  };
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
      return 0.5 + (Math.random() * 0.3); // Random position between 50-80%
    case 'unloading':
      return 0.95;
    case 'delivered':
    case 'completed':
      return 1;
    default:
      return 0;
  }
}
