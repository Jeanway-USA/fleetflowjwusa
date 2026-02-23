import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ===== State IFTA Diesel Excise Tax Rates (per gallon) =====
const STATE_DIESEL_TAX: Record<string, number> = {
  AL: 0.29, AK: 0.08, AZ: 0.26, AR: 0.285, CA: 0.4175,
  CO: 0.205, CT: 0.4613, DE: 0.22, FL: 0.36, GA: 0.351,
  HI: 0.16, ID: 0.32, IL: 0.467, IN: 0.56, IA: 0.325,
  KS: 0.26, KY: 0.267, LA: 0.20, ME: 0.312, MD: 0.3675,
  MA: 0.24, MI: 0.267, MN: 0.285, MS: 0.18, MO: 0.195,
  MT: 0.2975, NE: 0.26, NV: 0.27, NH: 0.234, NJ: 0.485,
  NM: 0.21, NY: 0.3055, NC: 0.382, ND: 0.23, OH: 0.385,
  OK: 0.19, OR: 0.38, PA: 0.741, RI: 0.34, SC: 0.28,
  SD: 0.28, TN: 0.27, TX: 0.20, UT: 0.32, VT: 0.31,
  VA: 0.302, WA: 0.494, WV: 0.357, WI: 0.327, WY: 0.24,
};

// ===== LCAPP Partner Directory =====
const LCAPP_PARTNERS: Record<string, { minDiscount: number; maxDiscount: number; amenities: string[] }> = {
  'Pilot/Flying J': { minDiscount: 0.08, maxDiscount: 0.25, amenities: ['Showers', 'Parking', 'DEF', 'Scales', 'WiFi'] },
  "Love's Travel Stops": { minDiscount: 0.05, maxDiscount: 0.15, amenities: ['Showers', 'Parking', 'DEF', 'Tire Care'] },
  'TA/Petro': { minDiscount: 0.05, maxDiscount: 0.20, amenities: ['Showers', 'Parking', 'DEF', 'Full Service', 'Scales'] },
  'Sapp Bros': { minDiscount: 0.04, maxDiscount: 0.12, amenities: ['Showers', 'Parking', 'DEF'] },
  "Casey's General Stores": { minDiscount: 0.03, maxDiscount: 0.08, amenities: ['DEF', 'Parking'] },
  "Buc-ee's": { minDiscount: 0.03, maxDiscount: 0.10, amenities: ['Parking', 'DEF', 'Food'] },
};

// Known truck stop locations along major US interstates
const KNOWN_STOPS: Array<{
  name: string;
  chain: string;
  lat: number;
  lng: number;
  state: string;
  city: string;
}> = [
  // I-40 Corridor
  { name: "Pilot Travel Center #356", chain: "Pilot/Flying J", lat: 35.4676, lng: -97.5164, state: "OK", city: "Oklahoma City" },
  { name: "Love's Travel Stop #308", chain: "Love's Travel Stops", lat: 35.2220, lng: -97.4395, state: "OK", city: "Norman" },
  { name: "Pilot Travel Center #445", chain: "Pilot/Flying J", lat: 35.0844, lng: -106.6504, state: "NM", city: "Albuquerque" },
  { name: "Love's Travel Stop #218", chain: "Love's Travel Stops", lat: 35.1495, lng: -90.0490, state: "TN", city: "Memphis" },
  { name: "TA #29", chain: "TA/Petro", lat: 35.3733, lng: -94.4285, state: "AR", city: "Fort Smith" },
  // I-10 Corridor
  { name: "Buc-ee's #41", chain: "Buc-ee's", lat: 29.7604, lng: -95.3698, state: "TX", city: "Houston" },
  { name: "Pilot Travel Center #512", chain: "Pilot/Flying J", lat: 30.4515, lng: -91.1871, state: "LA", city: "Baton Rouge" },
  { name: "Love's Travel Stop #401", chain: "Love's Travel Stops", lat: 31.7619, lng: -106.4850, state: "TX", city: "El Paso" },
  { name: "TA #75", chain: "TA/Petro", lat: 29.4241, lng: -98.4936, state: "TX", city: "San Antonio" },
  { name: "Pilot Travel Center #680", chain: "Pilot/Flying J", lat: 30.3322, lng: -81.6557, state: "FL", city: "Jacksonville" },
  // I-95 Corridor (expanded)
  { name: "Pilot Travel Center #201", chain: "Pilot/Flying J", lat: 36.8529, lng: -75.9780, state: "VA", city: "Virginia Beach" },
  { name: "Love's Travel Stop #550", chain: "Love's Travel Stops", lat: 35.2271, lng: -80.8431, state: "NC", city: "Charlotte" },
  { name: "TA #157", chain: "TA/Petro", lat: 39.2904, lng: -76.6122, state: "MD", city: "Baltimore" },
  { name: "Pilot Travel Center #320", chain: "Pilot/Flying J", lat: 34.0007, lng: -81.0348, state: "SC", city: "Columbia" },
  // I-95 Northeast additions
  { name: "TA #220", chain: "TA/Petro", lat: 41.7658, lng: -72.6734, state: "CT", city: "Hartford" },
  { name: "Pilot Travel Center #188", chain: "Pilot/Flying J", lat: 41.8240, lng: -71.4128, state: "RI", city: "Providence" },
  { name: "Love's Travel Stop #622", chain: "Love's Travel Stops", lat: 41.1865, lng: -73.1952, state: "CT", city: "Bridgeport" },
  { name: "TA #198", chain: "TA/Petro", lat: 41.3083, lng: -72.9279, state: "CT", city: "New Haven" },
  { name: "Pilot Travel Center #195", chain: "Pilot/Flying J", lat: 41.0534, lng: -73.5387, state: "CT", city: "Stamford" },
  { name: "Love's Travel Stop #710", chain: "Love's Travel Stops", lat: 39.3643, lng: -74.4229, state: "NJ", city: "Atlantic City" },
  { name: "TA #165", chain: "TA/Petro", lat: 39.6837, lng: -75.7497, state: "DE", city: "Newark DE" },
  { name: "Pilot Travel Center #177", chain: "Pilot/Flying J", lat: 37.5407, lng: -77.4360, state: "VA", city: "Richmond" },
  { name: "Love's Travel Stop #480", chain: "Love's Travel Stops", lat: 38.8816, lng: -77.0910, state: "VA", city: "Alexandria" },
  // I-90 / I-78 / NJ Turnpike additions
  { name: "TA #250", chain: "TA/Petro", lat: 40.7357, lng: -74.1724, state: "NJ", city: "Newark NJ" },
  { name: "Pilot Travel Center #260", chain: "Pilot/Flying J", lat: 40.5187, lng: -74.4121, state: "NJ", city: "Edison" },
  { name: "Love's Travel Stop #340", chain: "Love's Travel Stops", lat: 40.6023, lng: -75.4714, state: "PA", city: "Allentown" },
  { name: "TA #275", chain: "TA/Petro", lat: 42.2626, lng: -71.8023, state: "MA", city: "Worcester" },
  { name: "Pilot Travel Center #285", chain: "Pilot/Flying J", lat: 42.1015, lng: -72.5898, state: "MA", city: "Springfield" },
  { name: "Love's Travel Stop #295", chain: "Love's Travel Stops", lat: 42.6526, lng: -73.7562, state: "NY", city: "Albany" },
  { name: "TA #300", chain: "TA/Petro", lat: 42.8864, lng: -78.8784, state: "NY", city: "Buffalo" },
  { name: "Pilot Travel Center #305", chain: "Pilot/Flying J", lat: 43.0481, lng: -76.1474, state: "NY", city: "Syracuse" },
  // I-75 Corridor
  { name: "Pilot Travel Center #105", chain: "Pilot/Flying J", lat: 33.7490, lng: -84.3880, state: "GA", city: "Atlanta" },
  { name: "Love's Travel Stop #620", chain: "Love's Travel Stops", lat: 36.1627, lng: -86.7816, state: "TN", city: "Nashville" },
  { name: "Sapp Bros #12", chain: "Sapp Bros", lat: 39.7684, lng: -86.1581, state: "IN", city: "Indianapolis" },
  { name: "Pilot Travel Center #230", chain: "Pilot/Flying J", lat: 42.3314, lng: -83.0458, state: "MI", city: "Detroit" },
  // I-35 Corridor
  { name: "Buc-ee's #28", chain: "Buc-ee's", lat: 30.2672, lng: -97.7431, state: "TX", city: "Austin" },
  { name: "Love's Travel Stop #720", chain: "Love's Travel Stops", lat: 32.7767, lng: -96.7970, state: "TX", city: "Dallas" },
  { name: "Sapp Bros #8", chain: "Sapp Bros", lat: 41.2565, lng: -95.9345, state: "NE", city: "Omaha" },
  { name: "Casey's #1456", chain: "Casey's General Stores", lat: 41.6611, lng: -93.6087, state: "IA", city: "Des Moines" },
  { name: "Pilot Travel Center #400", chain: "Pilot/Flying J", lat: 39.0997, lng: -94.5786, state: "MO", city: "Kansas City" },
  // I-80/I-90 Corridor
  { name: "Pilot Travel Center #150", chain: "Pilot/Flying J", lat: 41.8781, lng: -87.6298, state: "IL", city: "Chicago" },
  { name: "TA #200", chain: "TA/Petro", lat: 40.4406, lng: -79.9959, state: "PA", city: "Pittsburgh" },
  { name: "Love's Travel Stop #830", chain: "Love's Travel Stops", lat: 40.7608, lng: -111.8910, state: "UT", city: "Salt Lake City" },
  { name: "Sapp Bros #3", chain: "Sapp Bros", lat: 40.8136, lng: -96.7026, state: "NE", city: "Lincoln" },
  { name: "Pilot Travel Center #555", chain: "Pilot/Flying J", lat: 41.0534, lng: -83.6419, state: "OH", city: "Findlay" },
  // I-20 Corridor
  { name: "Love's Travel Stop #290", chain: "Love's Travel Stops", lat: 32.4487, lng: -99.7331, state: "TX", city: "Abilene" },
  { name: "Pilot Travel Center #310", chain: "Pilot/Flying J", lat: 33.5207, lng: -86.8025, state: "AL", city: "Birmingham" },
  { name: "TA #88", chain: "TA/Petro", lat: 32.4609, lng: -93.7503, state: "LA", city: "Shreveport" },
  // I-70 Corridor
  { name: "Pilot Travel Center #440", chain: "Pilot/Flying J", lat: 39.7392, lng: -104.9903, state: "CO", city: "Denver" },
  { name: "Love's Travel Stop #510", chain: "Love's Travel Stops", lat: 38.6270, lng: -90.1994, state: "MO", city: "St. Louis" },
  { name: "Casey's #892", chain: "Casey's General Stores", lat: 39.0119, lng: -98.4842, state: "KS", city: "Hays" },
  // I-65 Corridor
  { name: "Pilot Travel Center #275", chain: "Pilot/Flying J", lat: 38.2527, lng: -85.7585, state: "KY", city: "Louisville" },
  { name: "Love's Travel Stop #405", chain: "Love's Travel Stops", lat: 34.7304, lng: -86.5861, state: "AL", city: "Huntsville" },
  // I-81 / I-77 / I-40 Corridor (PA to TN)
  { name: "Pilot Travel Center #820", chain: "Pilot/Flying J", lat: 40.2732, lng: -76.8867, state: "PA", city: "Harrisburg" },
  { name: "Love's Travel Stop #825", chain: "Love's Travel Stops", lat: 40.2015, lng: -77.1890, state: "PA", city: "Carlisle" },
  { name: "TA #830", chain: "TA/Petro", lat: 39.6418, lng: -77.7200, state: "MD", city: "Hagerstown" },
  { name: "Pilot Travel Center #835", chain: "Pilot/Flying J", lat: 39.1857, lng: -78.1633, state: "VA", city: "Winchester" },
  { name: "Love's Travel Stop #840", chain: "Love's Travel Stops", lat: 38.1496, lng: -79.0717, state: "VA", city: "Staunton" },
  { name: "TA #845", chain: "TA/Petro", lat: 37.2710, lng: -79.9414, state: "VA", city: "Roanoke" },
  { name: "Pilot Travel Center #850", chain: "Pilot/Flying J", lat: 36.9849, lng: -81.1950, state: "VA", city: "Wytheville" },
  { name: "Love's Travel Stop #855", chain: "Love's Travel Stops", lat: 36.5951, lng: -82.1887, state: "VA", city: "Bristol" },
  { name: "Pilot Travel Center #860", chain: "Pilot/Flying J", lat: 35.9606, lng: -83.9207, state: "TN", city: "Knoxville" },
  { name: "TA #865", chain: "TA/Petro", lat: 36.1628, lng: -85.5016, state: "TN", city: "Cookeville" },
  { name: "Love's Travel Stop #870", chain: "Love's Travel Stops", lat: 35.9489, lng: -84.9394, state: "TN", city: "Crossville" },
  // Additional high-traffic stops
  { name: "Pilot Travel Center #600", chain: "Pilot/Flying J", lat: 36.1699, lng: -115.1398, state: "NV", city: "Las Vegas" },
  { name: "Love's Travel Stop #920", chain: "Love's Travel Stops", lat: 47.6062, lng: -122.3321, state: "WA", city: "Seattle" },
  { name: "TA #310", chain: "TA/Petro", lat: 44.9778, lng: -93.2650, state: "MN", city: "Minneapolis" },
  { name: "Pilot Travel Center #700", chain: "Pilot/Flying J", lat: 34.0522, lng: -118.2437, state: "CA", city: "Los Angeles" },
  { name: "Love's Travel Stop #150", chain: "Love's Travel Stops", lat: 33.4484, lng: -112.0740, state: "AZ", city: "Phoenix" },
  { name: "Pilot Travel Center #810", chain: "Pilot/Flying J", lat: 45.5152, lng: -122.6784, state: "OR", city: "Portland" },
];

// ===== EIA Diesel Price Data =====
const FALLBACK_DIESEL_PRICES: Record<string, number> = {
  'AL': 3.45, 'AK': 4.10, 'AZ': 3.65, 'AR': 3.40, 'CA': 4.85,
  'CO': 3.55, 'CT': 3.90, 'DE': 3.70, 'FL': 3.60, 'GA': 3.45,
  'HI': 5.20, 'ID': 3.60, 'IL': 3.65, 'IN': 3.50, 'IA': 3.40,
  'KS': 3.35, 'KY': 3.45, 'LA': 3.35, 'ME': 3.85, 'MD': 3.70,
  'MA': 3.85, 'MI': 3.55, 'MN': 3.50, 'MS': 3.35, 'MO': 3.35,
  'MT': 3.55, 'NE': 3.40, 'NV': 3.80, 'NH': 3.80, 'NJ': 3.75,
  'NM': 3.55, 'NY': 3.90, 'NC': 3.50, 'ND': 3.45, 'OH': 3.55,
  'OK': 3.30, 'OR': 3.75, 'PA': 3.85, 'RI': 3.85, 'SC': 3.45,
  'SD': 3.45, 'TN': 3.40, 'TX': 3.25, 'UT': 3.55, 'VT': 3.85,
  'VA': 3.55, 'WA': 3.90, 'WV': 3.60, 'WI': 3.50, 'WY': 3.50,
};

// National average for savings comparison
const NATIONAL_AVG_DIESEL = 3.55;

// ===== State bounding boxes for reverse geocoding coords → state =====
const STATE_BOUNDS: Array<{ state: string; minLat: number; maxLat: number; minLng: number; maxLng: number }> = [
  { state: 'ME', minLat: 43.06, maxLat: 47.46, minLng: -71.08, maxLng: -66.95 },
  { state: 'NH', minLat: 42.70, maxLat: 45.30, minLng: -72.56, maxLng: -70.70 },
  { state: 'VT', minLat: 42.73, maxLat: 45.02, minLng: -73.44, maxLng: -71.46 },
  { state: 'MA', minLat: 41.24, maxLat: 42.89, minLng: -73.51, maxLng: -69.93 },
  { state: 'RI', minLat: 41.15, maxLat: 42.02, minLng: -71.86, maxLng: -71.12 },
  { state: 'CT', minLat: 40.99, maxLat: 42.05, minLng: -73.73, maxLng: -71.79 },
  { state: 'NY', minLat: 40.50, maxLat: 45.01, minLng: -79.76, maxLng: -71.86 },
  { state: 'NJ', minLat: 38.93, maxLat: 41.36, minLng: -75.56, maxLng: -73.89 },
  { state: 'PA', minLat: 39.72, maxLat: 42.27, minLng: -80.52, maxLng: -74.69 },
  { state: 'DE', minLat: 38.45, maxLat: 39.84, minLng: -75.79, maxLng: -75.05 },
  { state: 'MD', minLat: 37.91, maxLat: 39.72, minLng: -79.49, maxLng: -75.05 },
  { state: 'VA', minLat: 36.54, maxLat: 39.47, minLng: -83.68, maxLng: -75.24 },
  { state: 'WV', minLat: 37.20, maxLat: 40.64, minLng: -82.64, maxLng: -77.72 },
  { state: 'NC', minLat: 33.84, maxLat: 36.59, minLng: -84.32, maxLng: -75.46 },
  { state: 'SC', minLat: 32.03, maxLat: 35.21, minLng: -83.35, maxLng: -78.54 },
  { state: 'GA', minLat: 30.36, maxLat: 35.00, minLng: -85.61, maxLng: -80.84 },
  { state: 'FL', minLat: 24.40, maxLat: 31.00, minLng: -87.63, maxLng: -80.03 },
  { state: 'AL', minLat: 30.22, maxLat: 35.01, minLng: -88.47, maxLng: -84.89 },
  { state: 'MS', minLat: 30.17, maxLat: 34.99, minLng: -91.66, maxLng: -88.10 },
  { state: 'TN', minLat: 34.98, maxLat: 36.68, minLng: -90.31, maxLng: -81.65 },
  { state: 'KY', minLat: 36.50, maxLat: 39.15, minLng: -89.57, maxLng: -81.96 },
  { state: 'OH', minLat: 38.40, maxLat: 41.98, minLng: -84.82, maxLng: -80.52 },
  { state: 'IN', minLat: 37.77, maxLat: 41.76, minLng: -88.10, maxLng: -84.78 },
  { state: 'MI', minLat: 41.70, maxLat: 48.26, minLng: -90.42, maxLng: -82.12 },
  { state: 'IL', minLat: 36.97, maxLat: 42.51, minLng: -91.51, maxLng: -87.02 },
  { state: 'WI', minLat: 42.49, maxLat: 47.08, minLng: -92.89, maxLng: -86.25 },
  { state: 'MN', minLat: 43.50, maxLat: 49.38, minLng: -97.24, maxLng: -89.49 },
  { state: 'IA', minLat: 40.38, maxLat: 43.50, minLng: -96.64, maxLng: -90.14 },
  { state: 'MO', minLat: 35.99, maxLat: 40.61, minLng: -95.77, maxLng: -89.10 },
  { state: 'AR', minLat: 33.00, maxLat: 36.50, minLng: -94.62, maxLng: -89.64 },
  { state: 'LA', minLat: 28.93, maxLat: 33.02, minLng: -94.04, maxLng: -88.82 },
  { state: 'TX', minLat: 25.84, maxLat: 36.50, minLng: -106.65, maxLng: -93.51 },
  { state: 'OK', minLat: 33.62, maxLat: 37.00, minLng: -103.00, maxLng: -94.43 },
  { state: 'KS', minLat: 37.00, maxLat: 40.00, minLng: -102.05, maxLng: -94.59 },
  { state: 'NE', minLat: 40.00, maxLat: 43.00, minLng: -104.05, maxLng: -95.31 },
  { state: 'SD', minLat: 42.48, maxLat: 45.95, minLng: -104.06, maxLng: -96.44 },
  { state: 'ND', minLat: 45.94, maxLat: 49.00, minLng: -104.05, maxLng: -96.55 },
  { state: 'MT', minLat: 44.36, maxLat: 49.00, minLng: -116.05, maxLng: -104.04 },
  { state: 'WY', minLat: 41.00, maxLat: 45.01, minLng: -111.06, maxLng: -104.05 },
  { state: 'CO', minLat: 37.00, maxLat: 41.00, minLng: -109.06, maxLng: -102.04 },
  { state: 'NM', minLat: 31.33, maxLat: 37.00, minLng: -109.05, maxLng: -103.00 },
  { state: 'AZ', minLat: 31.33, maxLat: 37.00, minLng: -114.81, maxLng: -109.04 },
  { state: 'UT', minLat: 37.00, maxLat: 42.00, minLng: -114.05, maxLng: -109.04 },
  { state: 'NV', minLat: 35.00, maxLat: 42.00, minLng: -120.01, maxLng: -114.04 },
  { state: 'ID', minLat: 42.00, maxLat: 49.00, minLng: -117.24, maxLng: -111.04 },
  { state: 'WA', minLat: 45.54, maxLat: 49.00, minLng: -124.85, maxLng: -116.92 },
  { state: 'OR', minLat: 41.99, maxLat: 46.29, minLng: -124.57, maxLng: -116.46 },
  { state: 'CA', minLat: 32.53, maxLat: 42.01, minLng: -124.48, maxLng: -114.13 },
];

function lookupStateFromCoords(lat: number, lng: number): string {
  for (const b of STATE_BOUNDS) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return b.state;
    }
  }
  // Fallback: find nearest state center
  let nearest = 'TX';
  let minDist = Infinity;
  for (const b of STATE_BOUNDS) {
    const cLat = (b.minLat + b.maxLat) / 2;
    const cLng = (b.minLng + b.maxLng) / 2;
    const d = Math.abs(lat - cLat) + Math.abs(lng - cLng);
    if (d < minDist) { minDist = d; nearest = b.state; }
  }
  return nearest;
}

// ===== Utility Functions =====

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function distanceToRouteSegment(
  pointLat: number, pointLng: number,
  originLat: number, originLng: number,
  destLat: number, destLng: number
): number {
  const d1 = haversineDistance(originLat, originLng, pointLat, pointLng);
  const d2 = haversineDistance(pointLat, pointLng, destLat, destLng);
  const dRoute = haversineDistance(originLat, originLng, destLat, destLng);
  
  if (dRoute < 0.1) return d1;
  if (d1 * d1 > d2 * d2 + dRoute * dRoute) return d2;
  if (d2 * d2 > d1 * d1 + dRoute * dRoute) return d1;
  
  const s = (d1 + d2 + dRoute) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - d1) * (s - d2) * (s - dRoute)));
  return (2 * area) / dRoute;
}

// Build route segments from origin → waypoints → destination and return min distance
function distanceToMultiSegmentRoute(
  pointLat: number, pointLng: number,
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  waypoints?: Array<{ lat: number; lng: number }>
): number {
  if (!waypoints || waypoints.length === 0) {
    return distanceToRouteSegment(pointLat, pointLng, originLat, originLng, destLat, destLng);
  }

  const points = [
    { lat: originLat, lng: originLng },
    ...waypoints,
    { lat: destLat, lng: destLng },
  ];

  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToRouteSegment(
      pointLat, pointLng,
      points[i].lat, points[i].lng,
      points[i + 1].lat, points[i + 1].lng
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Polyline-based distance: compute min distance from a point to any segment of the polyline
function distanceToPolyline(
  pointLat: number, pointLng: number,
  polyline: Array<[number, number]>
): number {
  if (polyline.length < 2) {
    return polyline.length === 1
      ? haversineDistance(pointLat, pointLng, polyline[0][0], polyline[0][1])
      : Infinity;
  }

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToRouteSegment(
      pointLat, pointLng,
      polyline[i][0], polyline[i][1],
      polyline[i + 1][0], polyline[i + 1][1]
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Compute distance from a point to the route, preferring polyline if available
function distanceFromRoute(
  pointLat: number, pointLng: number,
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  waypoints?: Array<{ lat: number; lng: number }>,
  routePolyline?: Array<[number, number]>
): number {
  if (routePolyline && routePolyline.length >= 2) {
    return distanceToPolyline(pointLat, pointLng, routePolyline);
  }
  return distanceToMultiSegmentRoute(pointLat, pointLng, originLat, originLng, destLat, destLng, waypoints);
}

// Sample evenly-spaced points along a polyline every `intervalMiles`
function sampleRoutePoints(
  polyline: Array<[number, number]>,
  intervalMiles: number
): Array<[number, number]> {
  if (polyline.length < 2) return [...polyline];
  const sampled: Array<[number, number]> = [polyline[0]];
  let accumulated = 0;

  for (let i = 1; i < polyline.length; i++) {
    const segDist = haversineDistance(
      polyline[i - 1][0], polyline[i - 1][1],
      polyline[i][0], polyline[i][1]
    );
    accumulated += segDist;
    if (accumulated >= intervalMiles) {
      sampled.push(polyline[i]);
      accumulated = 0;
    }
  }

  // Always include the last point
  const last = polyline[polyline.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

// Generate interpolated truck stops along polyline to fill gaps
function generateInterpolatedStops(
  polyline: Array<[number, number]>,
  dieselPrices: Record<string, number>,
  now: string,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): any[] {
  const sampled = sampleRoutePoints(polyline, 50);
  const stops: any[] = [];

  for (let i = 0; i < sampled.length; i++) {
    const [lat, lng] = sampled[i];
    
    // Skip points within 20 miles of origin or destination
    const distToOrigin = haversineDistance(lat, lng, originLat, originLng);
    const distToDest = haversineDistance(lat, lng, destLat, destLng);
    if (distToOrigin < 20 || distToDest < 20) continue;

    const state = lookupStateFromCoords(lat, lng);
    const statePrice = dieselPrices[state] || FALLBACK_DIESEL_PRICES[state] || 3.55;
    const iftaCredit = STATE_DIESEL_TAX[state] ?? 0;

    stops.push({
      name: `Truck Stop - Mile ${Math.round(distToOrigin)}`,
      chain: null,
      latitude: lat,
      longitude: lng,
      state,
      city: `${state} Corridor`,
      diesel_price: statePrice,
      lcapp_discount: null,
      net_price: statePrice,
      ifta_tax_credit: iftaCredit,
      amenities: ['Diesel', 'Parking', 'Restrooms'],
      source: 'interpolated',
      fetched_at: now,
      distance_from_route: 0,
      distance_from_origin: distToOrigin,
    });
  }

  console.log(`Generated ${stops.length} interpolated stops along route (sampled ${sampled.length} points at 50mi intervals)`);
  return stops;
}

// Compute projected savings
function computeProjectedSavings(
  filteredStops: Array<{ net_price: number | null; diesel_price: number | null; lcapp_discount: number | null; state: string }>,
  estimatedGallons: number
): { cheapest_net: number; avg_price: number; savings_per_gallon: number; total_savings: number } | null {
  if (filteredStops.length === 0) return null;

  const priced = filteredStops.filter(s => (s.net_price ?? s.diesel_price ?? null) !== null);
  if (priced.length === 0) return null;

  const cheapestNet = Math.min(...priced.map(s => s.net_price ?? s.diesel_price ?? 999));
  const savingsPerGallon = Math.max(0, NATIONAL_AVG_DIESEL - cheapestNet);

  return {
    cheapest_net: parseFloat(cheapestNet.toFixed(2)),
    avg_price: NATIONAL_AVG_DIESEL,
    savings_per_gallon: parseFloat(savingsPerGallon.toFixed(3)),
    total_savings: parseFloat((savingsPerGallon * estimatedGallons).toFixed(2)),
  };
}

// ===== AES-GCM Decryption =====
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!keyString || keyString.length < 16) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured');
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptPassword(encryptedData: string): Promise<string> {
  if (!encryptedData.startsWith('enc:')) {
    console.warn('Found legacy plaintext password - will be encrypted on next save');
    return encryptedData;
  }
  const key = await getEncryptionKey();
  const base64Data = encryptedData.slice(4);
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ===== Landstar Scraper =====
async function attemptLandstarScrape(username: string, password: string): Promise<any[] | null> {
  console.log('Attempting Landstar portal authentication...');
  
  try {
    const loginResponse = await fetch('https://www.landstaronline.com/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: new URLSearchParams({
        'username': username,
        'password': password,
      }).toString(),
      redirect: 'manual',
    });

    console.log(`Landstar login response status: ${loginResponse.status}`);

    if (loginResponse.status !== 302 && loginResponse.status !== 200) {
      console.warn('Landstar login failed - unexpected status code');
      return null;
    }

    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) {
      console.warn('Landstar login - no session cookies received');
      return null;
    }

    const fuelResponse = await fetch('https://www.landstaronline.com/lcapp/fuel-stops', {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!fuelResponse.ok) {
      console.warn(`Landstar fuel page failed: ${fuelResponse.status}`);
      return null;
    }

    const html = await fuelResponse.text();
    
    const jsonMatch = html.match(/var\s+(?:fuelStops|stops|locations)\s*=\s*(\[[\\s\\S]*?\]);/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        console.log(`Parsed ${parsed.length} fuel stops from Landstar`);
        return parsed;
      } catch (e) {
        console.warn('Failed to parse Landstar fuel stop JSON:', e);
      }
    }
    
    console.warn('Could not find structured fuel data in Landstar response');
    return null;
    
  } catch (error) {
    console.error('Landstar scrape error:', error);
    return null;
  }
}

// ===== EIA API =====
async function fetchEIADieselPrices(): Promise<Record<string, number>> {
  try {
    const response = await fetch(
      'https://api.eia.gov/v2/petroleum/pri/gnd/data/?frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duession][]=PG1&sort[0][column]=period&sort[0][direction]=desc&length=10',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.warn(`EIA API returned ${response.status}, using fallback prices`);
      return FALLBACK_DIESEL_PRICES;
    }
    
    const data = await response.json();
    
    if (data?.response?.data?.length > 0) {
      const latestPrice = parseFloat(data.response.data[0].value);
      console.log(`EIA national average diesel: $${latestPrice}/gal`);
      
      const baseAvg = 3.55;
      const scaleFactor = latestPrice / baseAvg;
      
      const scaled: Record<string, number> = {};
      for (const [state, price] of Object.entries(FALLBACK_DIESEL_PRICES)) {
        scaled[state] = parseFloat((price * scaleFactor).toFixed(2));
      }
      return scaled;
    }
    
    return FALLBACK_DIESEL_PRICES;
  } catch (error) {
    console.warn('EIA API fetch failed, using fallback prices:', error);
    return FALLBACK_DIESEL_PRICES;
  }
}

// ===== Main Handler =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { 
      driver_id, 
      origin_lat, origin_lng, 
      dest_lat, dest_lng, 
      waypoints = [] as Array<{ lat: number; lng: number }>,
      route_polyline,
      corridor_miles = 50,
      force_refresh = false,
      booked_miles,
    } = body;

    console.log(`Waypoints received: ${waypoints.length}, route_polyline points: ${route_polyline?.length ?? 0}, corridor: ${corridor_miles}mi`);

    if (!driver_id || !origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: driver_id, origin_lat, origin_lng, dest_lat, dest_lng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fuel stops request: driver=${driver_id}, origin=(${origin_lat},${origin_lng}), dest=(${dest_lat},${dest_lng}), corridor=${corridor_miles}mi, force_refresh=${force_refresh}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Estimate gallons for projected savings
    const tripMiles = booked_miles || haversineDistance(origin_lat, origin_lng, dest_lat, dest_lng);
    const estimatedGallons = tripMiles / 6.5;

    // Check cache first (6 hour TTL) — skip if force_refresh
    if (!force_refresh) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      
      // Compute bounding box from polyline if available, otherwise from endpoints + waypoints
      let allLats: number[];
      let allLngs: number[];
      if (route_polyline && route_polyline.length > 0) {
        allLats = route_polyline.map((p: [number, number]) => p[0]);
        allLngs = route_polyline.map((p: [number, number]) => p[1]);
      } else {
        allLats = [origin_lat, dest_lat, ...waypoints.map((w: any) => w.lat)];
        allLngs = [origin_lng, dest_lng, ...waypoints.map((w: any) => w.lng)];
      }
      const minLat = Math.min(...allLats) - (corridor_miles / 69);
      const maxLat = Math.max(...allLats) + (corridor_miles / 69);
      const minLng = Math.min(...allLngs) - (corridor_miles / 54);
      const maxLng = Math.max(...allLngs) + (corridor_miles / 54);

      const { data: cachedStops } = await supabase
        .from('fuel_stops_cache')
        .select('*')
        .gte('fetched_at', sixHoursAgo)
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng);

      if (cachedStops && cachedStops.length > 0) {
        console.log(`Found ${cachedStops.length} cached fuel stops in bounding box`);
        
        const filtered = cachedStops
          .map(stop => ({
            ...stop,
            ifta_tax_credit: STATE_DIESEL_TAX[stop.state?.toUpperCase()] ?? 0,
            distance_from_route: distanceFromRoute(
              stop.latitude, stop.longitude,
              origin_lat, origin_lng, dest_lat, dest_lng,
              waypoints, route_polyline
            ),
            distance_from_origin: haversineDistance(origin_lat, origin_lng, stop.latitude, stop.longitude),
          }))
          .filter(stop => stop.distance_from_route <= corridor_miles)
          .sort((a, b) => (a.net_price || 999) - (b.net_price || 999));

        // If cache had stops but none within corridor, fall through to generate interpolated
        if (filtered.length > 0) {
          const projected_savings = computeProjectedSavings(filtered, estimatedGallons);

          return new Response(
            JSON.stringify({ fuel_stops: filtered, source: 'cache', fetched_at: cachedStops[0]?.fetched_at, projected_savings }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('Cache had stops but none within corridor, continuing to fresh fetch...');
      }
    }

    // Attempt Landstar scrape with driver's credentials
    let landstarData: any[] | null = null;
    
    const { data: driverSettings } = await supabase
      .from('driver_settings')
      .select('landstar_username, landstar_password')
      .eq('driver_id', driver_id)
      .maybeSingle();

    if (driverSettings?.landstar_username && driverSettings?.landstar_password) {
      console.log('Driver has Landstar credentials, attempting scrape...');
      try {
        const decryptedPassword = await decryptPassword(driverSettings.landstar_password);
        landstarData = await attemptLandstarScrape(
          driverSettings.landstar_username,
          decryptedPassword
        );
      } catch (decryptError) {
        console.error('Failed to decrypt Landstar password:', decryptError);
        console.log('Falling back to public data');
      }
    } else {
      console.log('No Landstar credentials for this driver, using fallback data');
    }

    // Fetch current diesel prices from EIA
    const dieselPrices = await fetchEIADieselPrices();

    // Build fuel stops list
    const fuelStops: any[] = [];
    const now = new Date().toISOString();

    if (landstarData && landstarData.length > 0) {
      console.log(`Processing ${landstarData.length} Landstar fuel stops`);
      for (const stop of landstarData) {
        const state = (stop.state || '').toUpperCase();
        const iftaCredit = STATE_DIESEL_TAX[state] ?? 0;
        fuelStops.push({
          name: stop.name || stop.station_name || 'Unknown Stop',
          chain: stop.chain || stop.brand || null,
          latitude: parseFloat(stop.latitude || stop.lat),
          longitude: parseFloat(stop.longitude || stop.lng),
          state: state,
          city: stop.city || '',
          diesel_price: parseFloat(stop.diesel_price || stop.price || 0),
          lcapp_discount: parseFloat(stop.lcapp_discount || stop.discount || 0),
          net_price: parseFloat(stop.net_price || (stop.price - (stop.discount || 0))),
          ifta_tax_credit: iftaCredit,
          amenities: stop.amenities || [],
          source: 'landstar',
          fetched_at: now,
        });
      }
    } else {
      console.log('Using LCAPP partner directory with EIA diesel prices');
      
      for (const stop of KNOWN_STOPS) {
        const statePrice = dieselPrices[stop.state] || 3.50;
        const partner = LCAPP_PARTNERS[stop.chain];
        const avgDiscount = partner 
          ? parseFloat(((partner.minDiscount + partner.maxDiscount) / 2).toFixed(2))
          : 0;
        const netPrice = parseFloat((statePrice - avgDiscount).toFixed(2));
        const iftaCredit = STATE_DIESEL_TAX[stop.state] ?? 0;

        fuelStops.push({
          name: stop.name,
          chain: stop.chain,
          latitude: stop.lat,
          longitude: stop.lng,
          state: stop.state,
          city: stop.city,
          diesel_price: statePrice,
          lcapp_discount: avgDiscount > 0 ? avgDiscount : null,
          net_price: netPrice,
          ifta_tax_credit: iftaCredit,
          amenities: partner?.amenities || [],
          source: 'doe',
          fetched_at: now,
        });
      }
    }

    // Cache the results
    if (fuelStops.length > 0) {
      let cacheLats: number[];
      let cacheLngs: number[];
      if (route_polyline && route_polyline.length > 0) {
        cacheLats = route_polyline.map((p: [number, number]) => p[0]);
        cacheLngs = route_polyline.map((p: [number, number]) => p[1]);
      } else {
        cacheLats = [origin_lat, dest_lat, ...waypoints.map((w: any) => w.lat)];
        cacheLngs = [origin_lng, dest_lng, ...waypoints.map((w: any) => w.lng)];
      }
      const minLat = Math.min(...cacheLats) - 2;
      const maxLat = Math.max(...cacheLats) + 2;
      const minLng = Math.min(...cacheLngs) - 2;
      const maxLng = Math.max(...cacheLngs) + 2;

      await supabase
        .from('fuel_stops_cache')
        .delete()
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng);

      const cacheStops = fuelStops.map(({ ifta_tax_credit, distance_from_route, distance_from_origin, ...rest }: any) => rest);
      const { error: insertError } = await supabase
        .from('fuel_stops_cache')
        .insert(cacheStops);

      if (insertError) {
        console.warn('Failed to cache fuel stops:', insertError);
      } else {
        console.log(`Cached ${fuelStops.length} fuel stops`);
      }
    }

    // Filter stops within the corridor using polyline or multi-segment fallback
    const filteredStops = fuelStops
      .map((stop: any) => ({
        ...stop,
        distance_from_route: distanceFromRoute(
          stop.latitude, stop.longitude,
          origin_lat, origin_lng, dest_lat, dest_lng,
          waypoints, route_polyline
        ),
        distance_from_origin: haversineDistance(origin_lat, origin_lng, stop.latitude, stop.longitude),
      }))
      .filter((stop: any) => stop.distance_from_route <= corridor_miles)
      .sort((a: any, b: any) => (a.net_price || 999) - (b.net_price || 999));

    console.log(`Filtered to ${filteredStops.length} stops within ${corridor_miles}mi corridor (total available: ${fuelStops.length})`);

    // ===== DENSITY-BASED INTERPOLATED FALLBACK =====
    const minExpectedStops = Math.max(3, Math.floor(tripMiles / 100));
    let finalStops = filteredStops;
    let source = landstarData ? 'landstar' : 'doe';

    if (filteredStops.length < minExpectedStops && route_polyline && route_polyline.length >= 2) {
      console.log(`Sparse results: ${filteredStops.length} stops for ${Math.round(tripMiles)}mi trip (need ${minExpectedStops}). Generating interpolated stops...`);
      const interpolated = generateInterpolatedStops(
        route_polyline, dieselPrices, now,
        origin_lat, origin_lng, dest_lat, dest_lng
      );

      // Deduplicate: remove interpolated stops within 15mi of a real stop
      const dedupedInterpolated = interpolated.filter(iStop => {
        return !filteredStops.some((rStop: any) =>
          haversineDistance(iStop.latitude, iStop.longitude, rStop.latitude, rStop.longitude) < 15
        );
      });

      // Merge real + interpolated, sort by distance from origin
      finalStops = [...filteredStops, ...dedupedInterpolated]
        .sort((a: any, b: any) => (a.distance_from_origin || 0) - (b.distance_from_origin || 0));

      console.log(`Density fill: ${filteredStops.length} real + ${dedupedInterpolated.length} interpolated (${interpolated.length - dedupedInterpolated.length} deduped) = ${finalStops.length} total`);
      if (filteredStops.length === 0) source = 'interpolated';
    }

    console.log(`total_waypoints_sampled: ${route_polyline?.length ?? 0}, total_deduplicated_stops_found: ${finalStops.length}`);

    const projected_savings = computeProjectedSavings(finalStops, estimatedGallons);

    return new Response(
      JSON.stringify({
        fuel_stops: finalStops,
        source,
        fetched_at: now,
        total_available: fuelStops.length,
        filtered_count: finalStops.length,
        projected_savings,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fuel stops error:', error);
    return new Response(
      JSON.stringify({ error: 'An internal error occurred while fetching fuel stops.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
