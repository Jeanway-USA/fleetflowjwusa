import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const USER_AGENT = 'FleetFlow-TMS/1.0 (contact: support@fleetflow-tms.com)';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const US_BBOX = '(24.5,-125.0,49.5,-66.0)';

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

// ─── Overpass Fetcher (fallback for Love's & Pilot/FJ) ────────────────
async function fetchFromOverpass(brandRegex: string, label: string): Promise<StopRecord[]> {
  console.log(`[${label}] Fetching from Overpass...`);

  const query = `[out:json][timeout:180];
(
  nwr["brand"~"${brandRegex}",i]${US_BBOX};
  nwr["name"~"${brandRegex}",i]${US_BBOX};
);
out center;`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(120000),
      });

      if (res.status === 429 || res.status === 504) {
        const wait = (attempt + 1) * 15000;
        console.warn(`[${label}] Overpass ${res.status}, retrying in ${wait / 1000}s...`);
        await res.text().catch(() => {});
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        const text = await res.text().catch(() => '');
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 15000));
            continue;
          }
          throw new Error(`Overpass returned HTML after retries`);
        }
      }

      if (!res.ok) throw new Error(`Overpass ${res.status}`);

      const data = await res.json();
      const elements = data?.elements || [];
      const stops: StopRecord[] = [];
      const seen = new Set<string>();

      for (const el of elements) {
        const tags = el.tags;
        if (!tags) continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (!lat || !lon) continue;

        const brand = classifyBrand(tags, label);
        if (!brand) continue;

        const city = tags['addr:city'] || '';
        const state = (tags['addr:state'] || '').toUpperCase().slice(0, 2);
        let storeNum = tags.ref || (city && state ? `${brand}-${city}-${state}` : `${brand}-${el.type}-${el.id}`);

        const key = `${brand}-${storeNum}`;
        if (seen.has(key)) continue;
        seen.add(key);

        stops.push({
          brand,
          store_number: storeNum,
          name: tags.name || `${brand} Travel Center`,
          address: tags['addr:street'] || '',
          city,
          state,
          latitude: lat,
          longitude: lon,
          amenities: ['Diesel', 'Parking'],
        });
      }

      // Proximity dedup
      stops.sort((a, b) => a.brand.localeCompare(b.brand) || a.latitude - b.latitude);
      const deduped: StopRecord[] = [];
      for (const stop of stops) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.brand === stop.brand &&
            Math.abs(prev.latitude - stop.latitude) < 0.01 &&
            Math.abs(prev.longitude - stop.longitude) < 0.01) continue;
        deduped.push(stop);
      }

      console.log(`[${label}] Overpass: ${elements.length} elements → ${deduped.length} locations`);
      return deduped;

    } catch (err) {
      console.warn(`[${label}] Overpass attempt ${attempt} error:`, err);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 10000));
      }
    }
  }

  console.error(`[${label}] All Overpass attempts failed`);
  return [];
}

function classifyBrand(tags: Record<string, string>, context: string): string | null {
  const combined = `${tags.brand || ''} ${tags.name || ''} ${tags.operator || ''}`.toLowerCase();
  if (context.includes("Love")) {
    if (combined.includes("love's") || combined.includes('loves')) return "Love's";
    return null;
  }
  if (context.includes("Pilot")) {
    if (combined.includes('flying j')) return 'Flying J';
    if (combined.includes('pilot')) return 'Pilot';
    return null;
  }
  return null;
}

// ─── Love's ──────────────────────────────────────────────────────────
async function fetchLovesLocations(): Promise<StopRecord[]> {
  return fetchFromOverpass("Love's|Loves", "Love's");
}

// ─── Pilot / Flying J ────────────────────────────────────────────────
async function fetchPilotFlyingJLocations(): Promise<StopRecord[]> {
  return fetchFromOverpass("Pilot|Flying J", "Pilot/FJ");
}

// ─── TA / Petro (Corporate HTML Directory) ───────────────────────────
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

async function fetchTAPetroLocations(): Promise<StopRecord[]> {
  console.log("[TA/Petro] Fetching from corporate directory...");
  const stops: StopRecord[] = [];

  try {
    const res = await fetch('https://www.ta-petro.com/location/all-locations/', {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`[TA/Petro] HTTP ${res.status}`);
      return stops;
    }

    const html = await res.text();
    let currentState = '';

    // Parse state from URL path pattern /location/XX/
    // Also parse from h5 headers
    const lines = html.split('\n');
    for (const line of lines) {
      // Check for state header patterns
      for (const [stateName, stateCode] of Object.entries(US_STATES)) {
        if (line.includes(`>${stateName}<`) || line.includes(`##### ${stateName}`)) {
          currentState = stateCode;
          break;
        }
      }

      // Match location entries: "TA Express Birmingham #0947" or "Petro Bucksville #0319"
      const locRegex = /(TA Express|TA Truck Service|Petro|TA)\s+(.+?)\s+#(\d{3,4})/g;
      let locMatch;
      while ((locMatch = locRegex.exec(line)) !== null) {
        const rawBrand = locMatch[1];
        const cityName = locMatch[2].trim();
        const storeNum = locMatch[3];

        // Also try to extract state from URL in the same line
        const urlMatch = line.match(/\/location\/([a-z]{2})\//);
        const urlState = urlMatch ? urlMatch[1].toUpperCase() : '';
        const finalState = urlState || currentState;

        stops.push({
          brand: rawBrand === 'TA Truck Service' ? 'TA' : rawBrand,
          store_number: storeNum,
          name: `${rawBrand} ${cityName} #${storeNum}`,
          address: '',
          city: cityName,
          state: finalState,
          latitude: 0,
          longitude: 0,
          amenities: ['Diesel', 'Parking'],
        });
      }
    }

    console.log(`[TA/Petro] Parsed ${stops.length} locations from directory`);

    // Geocode by unique city+state pairs to minimize API calls
    const cityStateMap = new Map<string, { lat: number; lon: number }>();
    const uniquePairs = new Set<string>();
    for (const stop of stops) {
      if (stop.city && stop.state) {
        uniquePairs.add(`${stop.city}|${stop.state}`);
      }
    }

    console.log(`[TA/Petro] Geocoding ${uniquePairs.size} unique city/state pairs...`);
    let geocoded = 0;

    for (const pair of uniquePairs) {
      const [city, state] = pair.split('|');
      // Clean up abbreviated city names for better geocoding
      const cleanCity = city
        .replace(/^N\.\s*/, 'North ')
        .replace(/^S\.\s*/, 'South ')
        .replace(/^E\.\s*/, 'East ')
        .replace(/^W\.\s*/, 'West ')
        .replace(/^Ft\.\s*/, 'Fort ')
        .replace(/^Mt\.\s*/, 'Mount ')
        .replace(/^St\.\s*/, 'Saint ')
        .replace(/\s*\(\d+\)$/, ''); // Remove "(1)" suffixes

      try {
        const query = encodeURIComponent(`${cleanCity}, ${state}, United States`);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`,
          {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.length > 0) {
            cityStateMap.set(pair, {
              lat: Number(geoData[0].lat),
              lon: Number(geoData[0].lon),
            });
            geocoded++;
          }
        }
      } catch (err) {
        // Log but continue
        console.warn(`[TA/Petro] Geocode error for "${cleanCity}, ${state}":`, err instanceof Error ? err.message : err);
      }

      // Nominatim rate limit: 1 request per second
      await new Promise(r => setTimeout(r, 1100));
    }

    console.log(`[TA/Petro] Geocoded ${geocoded}/${uniquePairs.size} unique cities`);

    // Apply coordinates to all matching stops
    let assigned = 0;
    for (const stop of stops) {
      const key = `${stop.city}|${stop.state}`;
      const coords = cityStateMap.get(key);
      if (coords) {
        stop.latitude = coords.lat;
        stop.longitude = coords.lon;
        assigned++;
      }
    }
    console.log(`[TA/Petro] Assigned coordinates to ${assigned}/${stops.length} stops`);

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

    // Auth check
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

    // Execute all fetchers concurrently
    // Love's and Pilot use Overpass as fallback (their corporate APIs require OAuth)
    // TA/Petro uses their corporate HTML directory with Nominatim geocoding
    console.log('Starting truck stop data aggregation...');

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

    // Filter stops missing coordinates
    const validStops = allStops.filter(s => s.latitude !== 0 && s.longitude !== 0);
    console.log(`Total: ${allStops.length} fetched, ${validStops.length} with coordinates`);

    // Batch upsert
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'An internal error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
