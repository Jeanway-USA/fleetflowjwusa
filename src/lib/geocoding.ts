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
  // Texas cities
  'lancaster': { lat: 32.5921, lng: -96.7561 },
  'arlington': { lat: 32.7357, lng: -97.1081 },
  'plano': { lat: 33.0198, lng: -96.6989 },
  'irving': { lat: 32.8140, lng: -96.9489 },
  'garland': { lat: 32.9126, lng: -96.6389 },
  'grand prairie': { lat: 32.7459, lng: -96.9978 },
  'mesquite': { lat: 32.7668, lng: -96.5992 },
  'frisco': { lat: 33.1507, lng: -96.8236 },
  'mckinney': { lat: 33.1972, lng: -96.6397 },
  'denton': { lat: 33.2148, lng: -97.1331 },
  'waco': { lat: 31.5493, lng: -97.1467 },
  'corpus christi': { lat: 27.8006, lng: -97.3964 },
  'brownsville': { lat: 25.9017, lng: -97.4975 },
  'lubbock': { lat: 33.5779, lng: -101.8552 },
  'amarillo': { lat: 35.2220, lng: -101.8313 },
  'midland': { lat: 31.9973, lng: -102.0779 },
  'odessa': { lat: 31.8457, lng: -102.3676 },
  // Mississippi cities
  'olive branch': { lat: 34.9618, lng: -89.8295 },
  'jackson': { lat: 32.2988, lng: -90.1848 },
  'gulfport': { lat: 30.3674, lng: -89.0928 },
  'southaven': { lat: 34.9889, lng: -90.0126 },
  'hattiesburg': { lat: 31.3271, lng: -89.2903 },
  'biloxi': { lat: 30.3960, lng: -88.8853 },
  'tupelo': { lat: 34.2576, lng: -88.7034 },
  'greenville': { lat: 33.4101, lng: -91.0618 },
  'horn lake': { lat: 34.9554, lng: -90.0348 },
  // Tennessee cities
  'chattanooga': { lat: 35.0456, lng: -85.3097 },
  'knoxville': { lat: 35.9606, lng: -83.9207 },
  'clarksville': { lat: 36.5298, lng: -87.3595 },
  'murfreesboro': { lat: 35.8456, lng: -86.3903 },
  // Arkansas cities
  'little rock': { lat: 34.7465, lng: -92.2896 },
  'fayetteville': { lat: 36.0822, lng: -94.1719 },
  'fort smith': { lat: 35.3859, lng: -94.3985 },
  // Louisiana cities
  'baton rouge': { lat: 30.4515, lng: -91.1871 },
  'shreveport': { lat: 32.5252, lng: -93.7502 },
  'lafayette': { lat: 30.2241, lng: -92.0198 },
  'lake charles': { lat: 30.2266, lng: -93.2174 },
  // Alabama cities
  'montgomery': { lat: 32.3792, lng: -86.3077 },
  'mobile': { lat: 30.6954, lng: -88.0399 },
  'huntsville': { lat: 34.7304, lng: -86.5861 },
  // Georgia cities
  'savannah': { lat: 32.0809, lng: -81.0912 },
  'augusta': { lat: 33.4735, lng: -81.9748 },
  'macon': { lat: 32.8407, lng: -83.6324 },
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
  'ms': { lat: 32.3547, lng: -89.3985 },
  'tn': { lat: 35.5175, lng: -86.5804 },
  'ar': { lat: 35.2010, lng: -91.8318 },
  'la': { lat: 30.9843, lng: -91.9623 },
  'al': { lat: 32.3182, lng: -86.9023 },
  'az': { lat: 34.0489, lng: -111.0937 },
  'nv': { lat: 38.8026, lng: -116.4194 },
  'co': { lat: 39.5501, lng: -105.7821 },
  'or': { lat: 43.8041, lng: -120.5542 },
  'wa': { lat: 47.7511, lng: -120.7401 },
  'mo': { lat: 37.9643, lng: -91.8318 },
  'md': { lat: 39.0458, lng: -76.6413 },
  'wi': { lat: 43.7844, lng: -88.7879 },
  'mn': { lat: 46.7296, lng: -94.6859 },
  'ky': { lat: 37.8393, lng: -84.2700 },
  'ok': { lat: 35.0078, lng: -97.0929 },
  'ut': { lat: 39.3210, lng: -111.0937 },
  'nm': { lat: 34.5199, lng: -105.8701 },
  'sc': { lat: 33.8361, lng: -81.1637 },
  'va': { lat: 37.4316, lng: -78.6569 },
  'in': { lat: 40.2672, lng: -86.1349 },
  'ma': { lat: 42.4072, lng: -71.3824 },
  'ct': { lat: 41.6032, lng: -73.0877 },
  'nj': { lat: 40.0583, lng: -74.4057 },
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
  
  // Try to match state abbreviation - return state center (no random offset for consistency)
  const stateMatch = location.match(/,?\s*(tx|ca|ny|fl|il|pa|oh|ga|nc|mi|wa|az|nv|co|or|tn|mo|md|wi|mn|la|ky|ok|ut|nm|al|sc|va|in|ma|ct|nj|ms|ar)$/i);
  if (stateMatch) {
    const state = stateMatch[1].toLowerCase();
    if (cityCoordinates[state]) {
      return cityCoordinates[state];
    }
  }
  
  // Return null if we can't find the location - better than showing wrong position
  console.warn(`Could not geocode location: ${location}`);
  return null;
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
