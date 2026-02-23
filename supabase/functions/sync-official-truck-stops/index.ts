import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

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

function classifyBrand(tags: Record<string, string>): string | null {
  const brand = (tags.brand || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();
  const combined = `${brand} ${name} ${operator}`;

  if (combined.includes('flying j')) return 'Flying J';
  if (combined.includes('pilot')) return 'Pilot';
  if (combined.includes("love's") || combined.includes('loves')) return "Love's";
  if (combined.includes('petro')) return 'Petro';
  if (/\bta\b/.test(combined) || combined.includes('travelcenter') || combined.includes('travel center')) return 'TA';
  if (combined.includes("roady's") || combined.includes('roadys')) return "Roady's";
  if (combined.includes('ambest')) return 'AMBEST';
  return null;
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

    // Parse bbox from body
    const body = await req.json().catch(() => ({}));
    const bbox = body.bbox;

    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return new Response(JSON.stringify({ error: 'bbox required as [south, west, north, east]' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [south, west, north, east] = bbox;
    const bboxStr = `(${south},${west},${north},${east})`;
    const query = `[out:json][timeout:180];\n(\n  node["amenity"="fuel"]["hgv"="yes"]${bboxStr};\n  way["amenity"="fuel"]["hgv"="yes"]${bboxStr};\n);\nout center;`;

    console.log(`Fetching bbox ${bboxStr}...`);

    // Fetch with retry for 429 rate limits
    let data: any;
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(200000),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const wait = (attempt + 1) * 15000; // 15s, 30s, 45s
        console.warn(`Overpass 429 — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await res.text().catch(() => {}); // drain body
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
        const text = await res.text().catch(() => '');
        if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<?xml')) {
          throw new Error(`Overpass returned HTML/XML (status ${res.status}) - likely rate limited`);
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
      }

      data = await res.json();
      break;
    }
    const elements = data?.elements || [];
    const stops: StopRecord[] = [];

    for (const el of elements) {
      const tags = el.tags;
      if (!tags) continue;

      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) continue;

      const brand = classifyBrand(tags);
      if (!brand) continue;

      const city = tags['addr:city'] || '';
      const state = (tags['addr:state'] || '').toUpperCase().slice(0, 2);

      let storeNumber = tags.ref;
      if (!storeNumber) {
        storeNumber = (city && state)
          ? `${brand}-${city}-${state}`
          : `${brand}-${el.type}-${el.id}`;
      }

      stops.push({
        brand,
        store_number: storeNumber,
        name: tags.name || `${brand} Travel Center`,
        address: tags['addr:street'] || '',
        city,
        state,
        latitude: lat,
        longitude: lon,
        amenities: ['Diesel', 'Parking'],
      });
    }

    // Upsert
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    const { count: totalCount } = await supabase
      .from('official_truck_stops')
      .select('*', { count: 'exact', head: true });

    const summary = {
      upserted,
      total_in_database: totalCount || 0,
      raw_fetched: elements.length,
      classified: stops.length,
    };

    console.log('Region sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'An internal error occurred during sync.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
