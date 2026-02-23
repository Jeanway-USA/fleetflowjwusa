import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface StopRecord {
  brand: string;
  store_number: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  amenities: string[];
}

// ─── Love's Travel Stops ──────────────────────────────────────────────
async function fetchLovesLocations(): Promise<StopRecord[]> {
  console.log("[Love's] Fetching locations...");
  const stops: StopRecord[] = [];

  // Love's locator uses a server-rendered search; we query with multiple center points
  const centerPoints = [
    { lat: 35.0, lng: -98.0 },  // Oklahoma (center US)
    { lat: 40.0, lng: -89.0 },  // Illinois
    { lat: 33.0, lng: -84.0 },  // Georgia
    { lat: 37.0, lng: -120.0 }, // California
    { lat: 43.0, lng: -75.0 },  // New York
    { lat: 30.0, lng: -95.0 },  // Texas
    { lat: 47.0, lng: -100.0 }, // North Dakota
  ];

  for (const center of centerPoints) {
    try {
      const url = `https://www.loves.com/api/sitecore/StoreLocator/GetNearbyStores`;
      const body = new URLSearchParams({
        latitude: center.lat.toString(),
        longitude: center.lng.toString(),
        radius: '1500',
        storeType: 'Travel Stop',
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.warn(`[Love's] HTTP ${res.status} for center (${center.lat}, ${center.lng})`);
        continue;
      }

      const data = await res.json();
      const stores = Array.isArray(data) ? data : (data?.stores || data?.Stores || data?.results || []);

      for (const s of stores) {
        const storeNum = s.storeNumber || s.StoreNumber || s.store_number || s.id || '';
        const lat = s.latitude || s.Latitude || s.lat;
        const lng = s.longitude || s.Longitude || s.lng || s.lon;
        if (!lat || !lng || !storeNum) continue;

        stops.push({
          brand: "Love's",
          store_number: String(storeNum),
          name: s.name || s.Name || s.storeName || `Love's #${storeNum}`,
          address: s.address || s.Address || s.streetAddress || '',
          city: s.city || s.City || '',
          state: (s.state || s.State || '').toUpperCase().slice(0, 2),
          latitude: Number(lat),
          longitude: Number(lng),
          amenities: ['Diesel', 'Parking'],
        });
      }
    } catch (err) {
      console.warn(`[Love's] Error for center (${center.lat}, ${center.lng}):`, err);
    }

    // Respectful delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Deduplicate by store_number
  const seen = new Set<string>();
  const unique = stops.filter(s => {
    if (seen.has(s.store_number)) return false;
    seen.add(s.store_number);
    return true;
  });

  console.log(`[Love's] Fetched ${unique.length} unique locations`);
  return unique;
}

// ─── Pilot / Flying J ─────────────────────────────────────────────────
async function fetchPilotFlyingJLocations(): Promise<StopRecord[]> {
  console.log("[Pilot/FJ] Fetching locations...");
  const stops: StopRecord[] = [];

  // Pilot/Flying J uses a Yext-powered locator. Try the content delivery API pattern.
  const searchCenters = [
    { lat: 39.0, lng: -98.0, label: 'Central US' },
    { lat: 34.0, lng: -84.0, label: 'Southeast' },
    { lat: 34.0, lng: -118.0, label: 'Southwest' },
    { lat: 42.0, lng: -73.0, label: 'Northeast' },
    { lat: 46.0, lng: -93.0, label: 'Upper Midwest' },
    { lat: 30.0, lng: -95.0, label: 'Texas' },
    { lat: 41.0, lng: -112.0, label: 'Mountain West' },
    { lat: 36.0, lng: -79.0, label: 'Mid-Atlantic' },
  ];

  for (const center of searchCenters) {
    try {
      // Try the known Pilot locator API endpoint
      const url = `https://www.pilotflyingj.com/api/v1/locations?lat=${center.lat}&lng=${center.lng}&radius=1000&limit=500`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        // Fallback: try the locator search endpoint
        const altUrl = `https://locations.pilotflyingj.com/api/getAsyncLocations?template=search&level=search&search=${center.lat},${center.lng}&radius=1000&limit=500`;
        const altRes = await fetch(altUrl, {
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        
        if (!altRes.ok) {
          console.warn(`[Pilot/FJ] Both endpoints failed for ${center.label}`);
          continue;
        }

        const altData = await altRes.json();
        const locs = altData?.response?.entities || altData?.locations || altData?.results || [];
        for (const loc of locs) {
          processPlfjLocation(loc, stops);
        }
        continue;
      }

      const data = await res.json();
      const locations = Array.isArray(data) ? data : (data?.locations || data?.results || data?.entities || []);

      for (const loc of locations) {
        processPlfjLocation(loc, stops);
      }
    } catch (err) {
      console.warn(`[Pilot/FJ] Error for ${center.label}:`, err);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = stops.filter(s => {
    const key = `${s.brand}-${s.store_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Pilot/FJ] Fetched ${unique.length} unique locations`);
  return unique;
}

function processPlfjLocation(loc: any, stops: StopRecord[]) {
  const lat = loc.latitude || loc.lat || loc.yextDisplayCoordinate?.latitude || loc.displayCoordinate?.latitude;
  const lng = loc.longitude || loc.lng || loc.lon || loc.yextDisplayCoordinate?.longitude || loc.displayCoordinate?.longitude;
  if (!lat || !lng) return;

  const name = loc.name || loc.geomodifier || loc.locationName || '';
  const isFlyingJ = /flying\s*j/i.test(name);
  const brand = isFlyingJ ? 'Flying J' : 'Pilot';
  
  const storeNum = loc.storeNumber || loc.store_number || loc.id || loc.meta?.id || '';
  if (!storeNum) return;

  stops.push({
    brand,
    store_number: String(storeNum),
    name: name || `${brand} #${storeNum}`,
    address: loc.address?.line1 || loc.address || loc.streetAddress || '',
    city: loc.address?.city || loc.city || '',
    state: (loc.address?.region || loc.address?.state || loc.state || '').toUpperCase().slice(0, 2),
    latitude: Number(lat),
    longitude: Number(lng),
    amenities: ['Diesel', 'Parking'],
  });
}

// ─── TA / Petro ───────────────────────────────────────────────────────
async function fetchTAPetroLocations(): Promise<StopRecord[]> {
  console.log("[TA/Petro] Fetching locations from directory...");
  const stops: StopRecord[] = [];

  try {
    // Fetch the all-locations directory page
    const res = await fetch('https://www.ta-petro.com/location/all-locations/', {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`[TA/Petro] HTTP ${res.status} from directory page`);
      return stops;
    }

    const html = await res.text();

    // Parse the structured HTML directory
    // Format: State headers with location links like "TA Tuscaloosa #0016", "Petro Bucksville #0319"
    let currentState = '';

    // Match state headers: ##### Alabama or <h5>Alabama</h5> etc.
    const stateRegex = /#{5}\s+([A-Za-z\s]+)|<h[45][^>]*>\s*([A-Za-z\s]+)\s*<\/h[45]>/g;
    const locationRegex = /(TA Express|TA Truck Service|Petro|TA)\s+(.+?)\s+#(\d{3,4})/g;

    // Split by state sections
    const stateMap: Record<string, string> = {};
    const US_STATES: Record<string, string> = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
      'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
      'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
      'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
      'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
      'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
      'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
      'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
      'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
    };

    // Split HTML into lines and process
    const lines = html.split('\n');
    for (const line of lines) {
      // Check for state header
      const stateMatch = line.match(/<h[1-6][^>]*>\s*([A-Za-z\s]+?)\s*<\/h[1-6]>/) ||
                          line.match(/#{3,6}\s+([A-Za-z\s]+)/);
      if (stateMatch) {
        const stateName = stateMatch[1].trim();
        if (US_STATES[stateName]) {
          currentState = US_STATES[stateName];
        }
      }

      // Match location entries
      let locMatch;
      const locRegex = /(TA Express|TA Truck Service|Petro|TA)\s+(.+?)\s+#(\d{3,4})/g;
      while ((locMatch = locRegex.exec(line)) !== null) {
        const rawBrand = locMatch[1];
        const cityName = locMatch[2].trim();
        const storeNum = locMatch[3];

        let brand = rawBrand;
        if (rawBrand === 'TA Express') brand = 'TA Express';
        else if (rawBrand === 'TA Truck Service') brand = 'TA';
        else if (rawBrand === 'TA') brand = 'TA';
        else if (rawBrand === 'Petro') brand = 'Petro';

        stops.push({
          brand,
          store_number: storeNum,
          name: `${rawBrand} ${cityName} #${storeNum}`,
          address: '',
          city: cityName,
          state: currentState,
          latitude: 0,
          longitude: 0,
          amenities: ['Diesel', 'Parking'],
        });
      }
    }

    console.log(`[TA/Petro] Parsed ${stops.length} locations from directory`);

    // Geocode using Nominatim (free, 1 req/sec rate limit)
    let geocoded = 0;
    for (const stop of stops) {
      if (!stop.city || !stop.state) continue;
      try {
        const query = encodeURIComponent(`${stop.city}, ${stop.state}, USA`);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
          {
            headers: { 'User-Agent': 'FleetFlow-TMS/1.0 (truck-stop-sync)' },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.length > 0) {
            stop.latitude = Number(geoData[0].lat);
            stop.longitude = Number(geoData[0].lon);
            geocoded++;
          }
        }
      } catch {
        // Skip geocoding errors silently
      }

      // Respect Nominatim rate limit (1 req/sec)
      await new Promise(r => setTimeout(r, 1100));
    }

    console.log(`[TA/Petro] Geocoded ${geocoded}/${stops.length} locations`);
  } catch (err) {
    console.error('[TA/Petro] Error:', err);
  }

  return stops;
}

// ─── Main Handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth check — require super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: isAdmin } = await supabaseUserClient.rpc('is_super_admin' as any);

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Execute all brand fetchers concurrently
    console.log('Starting corporate data aggregation...');
    const results = await Promise.allSettled([
      fetchLovesLocations(),
      fetchPilotFlyingJLocations(),
      fetchTAPetroLocations(),
    ]);

    const brandLabels = ["Love's", "Pilot/Flying J", "TA/Petro"];
    const brandCounts: Record<string, number> = {};
    let allStops: StopRecord[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        brandCounts[brandLabels[i]] = result.value.length;
        allStops = allStops.concat(result.value);
        console.log(`${brandLabels[i]}: ${result.value.length} locations`);
      } else {
        brandCounts[brandLabels[i]] = 0;
        console.error(`${brandLabels[i]} FAILED:`, result.reason);
      }
    }

    // Filter out stops missing coordinates
    const validStops = allStops.filter(s => s.latitude !== 0 && s.longitude !== 0);
    console.log(`Total valid stops with coordinates: ${validStops.length} / ${allStops.length}`);

    // Batch upsert into official_truck_stops
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let upserted = 0;

    for (let i = 0; i < validStops.length; i += 200) {
      const batch = validStops.slice(i, i + 200).map(s => ({
        ...s,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('official_truck_stops')
        .upsert(batch, { onConflict: 'brand,store_number', ignoreDuplicates: false });

      if (error) {
        console.warn(`Upsert batch error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Get total count
    const { count: totalCount } = await supabase
      .from('official_truck_stops')
      .select('*', { count: 'exact', head: true });

    const summary = {
      upserted,
      brand_counts: brandCounts,
      total_fetched: allStops.length,
      total_with_coords: validStops.length,
      total_in_database: totalCount || 0,
    };

    console.log('Sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An internal error occurred during sync.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
