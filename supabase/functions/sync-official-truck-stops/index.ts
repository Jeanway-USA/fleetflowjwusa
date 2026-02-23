import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const US_BBOX = '(24.0,-125.0,50.0,-66.0)';

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

async function fetchOverpassBrand(brandNames: string[]): Promise<StopRecord[]> {
  // Build union of brand queries
  const unionParts = brandNames.map(b =>
    `node["amenity"="fuel"]["brand"="${b}"]${US_BBOX};`
  ).join('\n  ');

  const query = `[out:json][timeout:60];\n(\n  ${unionParts}\n);\nout body;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const elements = data?.elements || [];
  const stops: StopRecord[] = [];

  for (const el of elements) {
    if (!el.lat || !el.lon || !el.tags) continue;
    const tags = el.tags;
    const brand = tags.brand || brandNames[0];
    const storeNum = tags.ref || `osm-${el.id}`;
    const state = tags['addr:state'] || '';
    if (!state) continue; // skip if no state

    stops.push({
      brand,
      store_number: storeNum,
      name: tags.name || `${brand} Travel Center`,
      address: tags['addr:street'] || '',
      city: tags['addr:city'] || '',
      state: state.toUpperCase().slice(0, 2),
      latitude: el.lat,
      longitude: el.lon,
      amenities: ['Diesel', 'Parking'],
    });
  }

  return stops;
}

async function upsertStops(supabase: any, stops: StopRecord[]): Promise<number> {
  if (stops.length === 0) return 0;
  let upserted = 0;

  for (let i = 0; i < stops.length; i += 200) {
    const batch = stops.slice(i, i + 200).map(s => ({
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

  return upserted;
}

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, number> = {};
    const errors: string[] = [];

    const brandGroups: Array<{ name: string; brands: string[] }> = [
      { name: 'Pilot/Flying J', brands: ['Pilot', 'Flying J'] },
      { name: "Love's", brands: ["Love's"] },
      { name: 'TA/Petro', brands: ['TA', 'Petro'] },
    ];

    for (const group of brandGroups) {
      try {
        console.log(`Fetching ${group.name} from Overpass...`);
        const stops = await fetchOverpassBrand(group.brands);
        console.log(`${group.name}: fetched ${stops.length} stops`);

        if (stops.length > 0) {
          const count = await upsertStops(supabase, stops);
          results[group.name] = count;
        } else {
          results[group.name] = 0;
          errors.push(`${group.name}: No stops returned from Overpass`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${group.name}: ${msg}`);
        results[group.name] = 0;
        console.error(`${group.name} sync failed:`, msg);
      }
    }

    const { count: totalCount } = await supabase
      .from('official_truck_stops')
      .select('*', { count: 'exact', head: true });

    const summary = {
      synced: results,
      total_in_database: totalCount || 0,
      errors: errors.length > 0 ? errors : undefined,
      synced_at: new Date().toISOString(),
    };

    console.log('Sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred during sync.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
