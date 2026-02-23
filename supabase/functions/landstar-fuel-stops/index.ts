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

const BRAND_TO_LCAPP: Record<string, string> = {
  'pilot': 'Pilot/Flying J',
  'flying j': 'Pilot/Flying J',
  "love's": "Love's Travel Stops",
  'loves': "Love's Travel Stops",
  'ta': 'TA/Petro',
  'petro': 'TA/Petro',
  'sapp bros': 'Sapp Bros',
  "casey's": "Casey's General Stores",
  "buc-ee's": "Buc-ee's",
};

function matchLCAPP(name: string, brand: string | null): string | null {
  const search = ((brand || '') + ' ' + (name || '')).toLowerCase();
  for (const [key, lcappName] of Object.entries(BRAND_TO_LCAPP)) {
    if (search.includes(key)) return lcappName;
  }
  return null;
}

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

function distanceToPolyline(pointLat: number, pointLng: number, polyline: Array<[number, number]>): number {
  if (polyline.length < 2) {
    return polyline.length === 1 ? haversineDistance(pointLat, pointLng, polyline[0][0], polyline[0][1]) : Infinity;
  }
  let minDist = Infinity;
  const step = polyline.length > 200 ? 5 : 1;
  for (let i = 0; i < polyline.length - step; i += step) {
    const j = Math.min(i + step, polyline.length - 1);
    const d = distanceToRouteSegment(pointLat, pointLng, polyline[i][0], polyline[i][1], polyline[j][0], polyline[j][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function sampleRoutePoints(polyline: Array<[number, number]>, intervalMiles: number): Array<[number, number]> {
  if (polyline.length < 2) return [...polyline];
  const sampled: Array<[number, number]> = [polyline[0]];
  let accumulated = 0;
  for (let i = 1; i < polyline.length; i++) {
    const segDist = haversineDistance(polyline[i - 1][0], polyline[i - 1][1], polyline[i][0], polyline[i][1]);
    accumulated += segDist;
    if (accumulated >= intervalMiles) {
      sampled.push(polyline[i]);
      accumulated = 0;
    }
  }
  const last = polyline[polyline.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

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
  if (!keyString || keyString.length < 16) throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured');
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptPassword(encryptedData: string): Promise<string> {
  if (!encryptedData.startsWith('enc:')) return encryptedData;
  const key = await getEncryptionKey();
  const base64Data = encryptedData.slice(4);
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      body: new URLSearchParams({ username, password }).toString(),
      redirect: 'manual',
    });
    if (loginResponse.status !== 302 && loginResponse.status !== 200) return null;
    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) return null;
    const fuelResponse = await fetch('https://www.landstaronline.com/lcapp/fuel-stops', {
      headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!fuelResponse.ok) return null;
    const html = await fuelResponse.text();
    const jsonMatch = html.match(/var\s+(?:fuelStops|stops|locations)\s*=\s*(\[[\s\S]*?\]);/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* ignore */ }
    }
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
    if (!response.ok) return FALLBACK_DIESEL_PRICES;
    const data = await response.json();
    if (data?.response?.data?.length > 0) {
      const latestPrice = parseFloat(data.response.data[0].value);
      const scaleFactor = latestPrice / 3.55;
      const scaled: Record<string, number> = {};
      for (const [state, price] of Object.entries(FALLBACK_DIESEL_PRICES)) {
        scaled[state] = parseFloat((price * scaleFactor).toFixed(2));
      }
      return scaled;
    }
    return FALLBACK_DIESEL_PRICES;
  } catch {
    return FALLBACK_DIESEL_PRICES;
  }
}

// ===== Generate Estimated Fallback Stops Along Route =====
const GENERIC_CHAINS = Object.keys(LCAPP_PARTNERS);

function generateEstimatedStops(
  polyline: Array<[number, number]>,
  dieselPrices: Record<string, number>,
  now: string,
  originLat: number, originLng: number,
  destLat: number, destLng: number
): any[] {
  const sampled = sampleRoutePoints(polyline, 75);
  const stops: any[] = [];
  let chainIdx = 0;

  for (let i = 0; i < sampled.length; i++) {
    const [lat, lng] = sampled[i];
    const distToOrigin = haversineDistance(lat, lng, originLat, originLng);
    const distToDest = haversineDistance(lat, lng, destLat, destLng);
    // Skip points near origin/destination
    if (distToOrigin < 20 || distToDest < 20) continue;

    const state = lookupStateFromCoords(lat, lng);
    const statePrice = dieselPrices[state] || FALLBACK_DIESEL_PRICES[state] || 3.55;
    const iftaCredit = STATE_DIESEL_TAX[state] ?? 0;
    const chainName = GENERIC_CHAINS[chainIdx % GENERIC_CHAINS.length];
    const partner = LCAPP_PARTNERS[chainName];
    const estimatedDiscount = 0.40;

    stops.push({
      name: `Travel Center - Mile ${Math.round(distToOrigin)}`,
      chain: chainName,
      brand: null,
      store_number: null,
      address: null,
      latitude: lat,
      longitude: lng,
      state,
      city: `${state} Corridor`,
      diesel_price: statePrice,
      lcapp_discount: estimatedDiscount,
      net_price: parseFloat((statePrice - estimatedDiscount).toFixed(2)),
      ifta_tax_credit: iftaCredit,
      amenities: partner?.amenities || ['Diesel', 'Parking', 'Restrooms'],
      source: 'estimated',
      stop_type: 'estimated',
      fetched_at: now,
      distance_from_route: 0,
      distance_from_origin: distToOrigin,
    });
    chainIdx++;
  }
  console.log(`Generated ${stops.length} estimated fallback stops along route`);
  return stops;
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
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse request body
    const body = await req.json();
    const {
      driver_id, origin_lat, origin_lng, dest_lat, dest_lng,
      waypoints = [] as Array<{ lat: number; lng: number }>,
      route_polyline,
      corridor_miles = 50,
      force_refresh = false,
      booked_miles,
    } = body;

    if (!driver_id || !origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Fuel stops: driver=${driver_id}, route=(${origin_lat},${origin_lng})->(${dest_lat},${dest_lng}), corridor=${corridor_miles}mi, polyline=${route_polyline?.length ?? 0}pts`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const tripMiles = booked_miles || haversineDistance(origin_lat, origin_lng, dest_lat, dest_lng);
    const estimatedGallons = tripMiles / 6.5;
    const now = new Date().toISOString();

    // Compute route bounding box
    let allLats: number[];
    let allLngs: number[];
    if (route_polyline && route_polyline.length > 0) {
      allLats = route_polyline.map((p: [number, number]) => p[0]);
      allLngs = route_polyline.map((p: [number, number]) => p[1]);
    } else {
      allLats = [origin_lat, dest_lat, ...waypoints.map((w: any) => w.lat)];
      allLngs = [origin_lng, dest_lng, ...waypoints.map((w: any) => w.lng)];
    }

    // ===== STEP 1: Check fuel_stops_cache (6h TTL) =====
    if (!force_refresh) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const bufDeg = corridor_miles / 69;
      const { data: cachedStops } = await supabase
        .from('fuel_stops_cache')
        .select('*')
        .gte('fetched_at', sixHoursAgo)
        .gte('latitude', Math.min(...allLats) - bufDeg)
        .lte('latitude', Math.max(...allLats) + bufDeg)
        .gte('longitude', Math.min(...allLngs) - (corridor_miles / 54))
        .lte('longitude', Math.max(...allLngs) + (corridor_miles / 54));

      if (cachedStops && cachedStops.length > 0) {
        const filtered = cachedStops
          .map(stop => ({
            ...stop,
            ifta_tax_credit: STATE_DIESEL_TAX[stop.state?.toUpperCase()] ?? 0,
            distance_from_route: route_polyline?.length >= 2
              ? distanceToPolyline(stop.latitude, stop.longitude, route_polyline)
              : haversineDistance(stop.latitude, stop.longitude, origin_lat, origin_lng),
            distance_from_origin: haversineDistance(origin_lat, origin_lng, stop.latitude, stop.longitude),
          }))
          .filter(stop => stop.distance_from_route <= corridor_miles)
          .sort((a, b) => (a.distance_from_origin || 0) - (b.distance_from_origin || 0));

        if (filtered.length > 0) {
          console.log(`Cache hit: ${filtered.length} stops within corridor`);
          return new Response(JSON.stringify({
            fuel_stops: filtered, source: filtered[0]?.source || 'cache',
            fetched_at: cachedStops[0]?.fetched_at,
            projected_savings: computeProjectedSavings(filtered, estimatedGallons),
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ===== STEP 2: Check Landstar credentials =====
    const { data: driverSettings } = await supabase
      .from('driver_settings')
      .select('landstar_username, landstar_password')
      .eq('driver_id', driver_id)
      .maybeSingle();

    const hasLandstarAuth = !!(driverSettings?.landstar_username && driverSettings?.landstar_password);

    // ===== STEP 3: Fetch EIA diesel prices =====
    const dieselPrices = await fetchEIADieselPrices();

    let filteredStops: any[] = [];
    let source = 'estimated';

    // ===== MODE A: Landstar Auth — scrape real LCAPP data =====
    if (hasLandstarAuth) {
      console.log('Mode A: Landstar credentials found, attempting scrape...');
      try {
        const decryptedPassword = await decryptPassword(driverSettings!.landstar_password!);
        const landstarData = await attemptLandstarScrape(driverSettings!.landstar_username!, decryptedPassword);

        if (landstarData && landstarData.length > 0) {
          console.log(`Landstar returned ${landstarData.length} stops, filtering to route corridor...`);

          // Sample route every 50mi and match Landstar stops within 20mi of any sample point
          const routePoly = route_polyline && route_polyline.length >= 2 ? route_polyline : null;
          const samplePoints = routePoly
            ? sampleRoutePoints(routePoly, 50)
            : [[origin_lat, origin_lng], [dest_lat, dest_lng]] as Array<[number, number]>;

          const matchedStops: any[] = [];
          const seen = new Set<string>();

          for (const ls of landstarData) {
            const lat = parseFloat(ls.lat || ls.latitude || 0);
            const lng = parseFloat(ls.lng || ls.longitude || 0);
            if (!lat || !lng) continue;

            // Check if within 20mi of any sample point
            const nearRoute = samplePoints.some(([sLat, sLng]) => haversineDistance(lat, lng, sLat, sLng) <= 20);
            if (!nearRoute) continue;

            const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const state = lookupStateFromCoords(lat, lng);
            const statePrice = dieselPrices[state] || FALLBACK_DIESEL_PRICES[state] || 3.55;
            const iftaCredit = STATE_DIESEL_TAX[state] ?? 0;
            const lcappKey = matchLCAPP(ls.name || '', ls.brand || '');
            const partner = lcappKey ? LCAPP_PARTNERS[lcappKey] : null;
            const discount = parseFloat(ls.lcapp_discount || ls.discount || 0) ||
              (partner ? parseFloat(((partner.minDiscount + partner.maxDiscount) / 2).toFixed(2)) : 0);
            const dieselPrice = parseFloat(ls.diesel_price || ls.price || 0) || statePrice;

            matchedStops.push({
              name: ls.name || `${lcappKey || 'Truck Stop'}`,
              chain: lcappKey || ls.brand || null,
              brand: ls.brand || null,
              store_number: ls.store_number || null,
              address: ls.address || null,
              latitude: lat,
              longitude: lng,
              state,
              city: ls.city || `${state} Corridor`,
              diesel_price: dieselPrice,
              lcapp_discount: discount > 0 ? discount : null,
              net_price: parseFloat((dieselPrice - discount).toFixed(2)),
              ifta_tax_credit: iftaCredit,
              amenities: partner?.amenities || ['Diesel', 'Parking'],
              source: 'landstar',
              stop_type: 'landstar',
              fetched_at: now,
              distance_from_route: routePoly ? distanceToPolyline(lat, lng, routePoly) : 0,
              distance_from_origin: haversineDistance(origin_lat, origin_lng, lat, lng),
            });
          }

          if (matchedStops.length > 0) {
            filteredStops = matchedStops.sort((a, b) => a.distance_from_origin - b.distance_from_origin);
            source = 'landstar';
            console.log(`Mode A success: ${filteredStops.length} Landstar stops along route`);
          }
        }
      } catch (e) {
        console.warn('Landstar scrape failed, falling back to estimated:', e);
      }
    }

    // ===== MODE B: Fallback — generate estimated stops along polyline =====
    if (filteredStops.length === 0) {
      console.log('Mode B: No Landstar data, generating estimated stops along route...');
      const routePoly = route_polyline && route_polyline.length >= 2 ? route_polyline : null;

      if (routePoly) {
        filteredStops = generateEstimatedStops(routePoly, dieselPrices, now, origin_lat, origin_lng, dest_lat, dest_lng);
      } else {
        // No polyline — generate stops along straight line
        const numStops = Math.max(2, Math.floor(tripMiles / 75));
        for (let i = 1; i <= numStops; i++) {
          const frac = i / (numStops + 1);
          const lat = origin_lat + frac * (dest_lat - origin_lat);
          const lng = origin_lng + frac * (dest_lng - origin_lng);
          const state = lookupStateFromCoords(lat, lng);
          const statePrice = dieselPrices[state] || FALLBACK_DIESEL_PRICES[state] || 3.55;
          const iftaCredit = STATE_DIESEL_TAX[state] ?? 0;
          const chainName = GENERIC_CHAINS[i % GENERIC_CHAINS.length];
          const estimatedDiscount = 0.40;

          filteredStops.push({
            name: `Travel Center - Mile ${Math.round(frac * tripMiles)}`,
            chain: chainName,
            brand: null, store_number: null, address: null,
            latitude: lat, longitude: lng,
            state, city: `${state} Corridor`,
            diesel_price: statePrice,
            lcapp_discount: estimatedDiscount,
            net_price: parseFloat((statePrice - estimatedDiscount).toFixed(2)),
            ifta_tax_credit: iftaCredit,
            amenities: LCAPP_PARTNERS[chainName]?.amenities || ['Diesel', 'Parking'],
            source: 'estimated', stop_type: 'estimated',
            fetched_at: now,
            distance_from_route: 0,
            distance_from_origin: frac * tripMiles,
          });
        }
      }
      source = 'estimated';
    }

    // ===== STEP 6: Cache results =====
    if (filteredStops.length > 0) {
      const cacheStops = filteredStops.map(({ ifta_tax_credit, distance_from_route, distance_from_origin, stop_type, ...rest }: any) => rest);
      const bufDeg2 = 2;
      await supabase.from('fuel_stops_cache').delete()
        .gte('latitude', Math.min(...allLats) - bufDeg2)
        .lte('latitude', Math.max(...allLats) + bufDeg2)
        .gte('longitude', Math.min(...allLngs) - bufDeg2)
        .lte('longitude', Math.max(...allLngs) + bufDeg2);
      const { error: cacheError } = await supabase.from('fuel_stops_cache').insert(cacheStops);
      if (cacheError) console.warn('Cache insert error:', cacheError.message);
      else console.log(`Cached ${cacheStops.length} stops`);
    }

    const projected_savings = computeProjectedSavings(filteredStops, estimatedGallons);

    return new Response(JSON.stringify({
      fuel_stops: filteredStops,
      source,
      fetched_at: now,
      filtered_count: filteredStops.length,
      projected_savings,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Fuel stops error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred while fetching fuel stops.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
