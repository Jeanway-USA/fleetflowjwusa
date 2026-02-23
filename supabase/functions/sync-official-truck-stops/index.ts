import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

// ===== Pilot/Flying J =====
async function fetchPilotFlyingJ(): Promise<StopRecord[]> {
  const stops: StopRecord[] = [];
  try {
    // Pilot Flying J public store locator API
    const res = await fetch('https://www.pilotflyingj.com/umbraco/api/LocationSearchApi/GetAllLocations', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Pilot API: ${res.status}`);
    const data = await res.json();
    const locations = Array.isArray(data) ? data : data?.locations || data?.results || [];
    
    for (const loc of locations) {
      const lat = parseFloat(loc.latitude || loc.lat || loc.Latitude || 0);
      const lng = parseFloat(loc.longitude || loc.lng || loc.Longitude || 0);
      if (!lat || !lng) continue;
      
      const storeNum = String(loc.storeNumber || loc.StoreNumber || loc.store_number || loc.id || loc.Id || '');
      if (!storeNum) continue;
      
      const brand = (loc.brand || loc.Brand || loc.locationType || '').toLowerCase().includes('flying') ? 'Flying J' : 'Pilot';
      const state = loc.state || loc.State || loc.stateProvince || '';
      if (!state) continue;
      
      stops.push({
        brand,
        store_number: storeNum,
        name: loc.name || loc.Name || loc.storeName || `${brand} Travel Center`,
        address: loc.address1 || loc.Address || loc.address || '',
        city: loc.city || loc.City || '',
        state: state.toUpperCase().slice(0, 2),
        latitude: lat,
        longitude: lng,
        amenities: ['Diesel', 'Showers', 'Parking', 'DEF', 'WiFi'],
      });
    }
  } catch (e) {
    console.error('Pilot/Flying J fetch error:', e);
    throw e;
  }
  return stops;
}

// ===== Love's Travel Stops =====
async function fetchLoves(): Promise<StopRecord[]> {
  const stops: StopRecord[] = [];
  try {
    // Love's public store API
    const res = await fetch('https://www.loves.com/api/sitecore/StoreSearch/SearchStores?latitude=39.8283&longitude=-98.5795&radius=3000&maxResults=1000', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Love's API: ${res.status}`);
    const data = await res.json();
    const locations = Array.isArray(data) ? data : data?.stores || data?.Stores || data?.results || [];
    
    for (const loc of locations) {
      const lat = parseFloat(loc.latitude || loc.Latitude || loc.lat || 0);
      const lng = parseFloat(loc.longitude || loc.Longitude || loc.lng || 0);
      if (!lat || !lng) continue;
      
      const storeNum = String(loc.storeNumber || loc.StoreNumber || loc.store_number || loc.id || loc.Id || '');
      if (!storeNum) continue;
      
      const state = loc.state || loc.State || '';
      if (!state) continue;
      
      stops.push({
        brand: "Love's",
        store_number: storeNum,
        name: loc.name || loc.Name || loc.storeName || "Love's Travel Stop",
        address: loc.address || loc.Address || loc.address1 || '',
        city: loc.city || loc.City || '',
        state: state.toUpperCase().slice(0, 2),
        latitude: lat,
        longitude: lng,
        amenities: ['Diesel', 'Showers', 'Parking', 'DEF', 'Tire Care'],
      });
    }
  } catch (e) {
    console.error("Love's fetch error:", e);
    throw e;
  }
  return stops;
}

// ===== TA/Petro =====
async function fetchTAPetro(): Promise<StopRecord[]> {
  const stops: StopRecord[] = [];
  try {
    // TA/Petro public location search
    const res = await fetch('https://www.ta-petro.com/api/location-search?lat=39.8283&lng=-98.5795&radius=3000&limit=500', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`TA/Petro API: ${res.status}`);
    const data = await res.json();
    const locations = Array.isArray(data) ? data : data?.locations || data?.results || data?.stores || [];
    
    for (const loc of locations) {
      const lat = parseFloat(loc.latitude || loc.lat || loc.Latitude || 0);
      const lng = parseFloat(loc.longitude || loc.lng || loc.Longitude || 0);
      if (!lat || !lng) continue;
      
      const storeNum = String(loc.storeNumber || loc.store_number || loc.siteNumber || loc.id || loc.Id || '');
      if (!storeNum) continue;
      
      const brand = (loc.brand || loc.Brand || loc.type || loc.name || '').toLowerCase().includes('petro') ? 'Petro' : 'TA';
      const state = loc.state || loc.State || '';
      if (!state) continue;
      
      stops.push({
        brand,
        store_number: storeNum,
        name: loc.name || loc.Name || `${brand} Travel Center`,
        address: loc.address || loc.Address || loc.address1 || '',
        city: loc.city || loc.City || '',
        state: state.toUpperCase().slice(0, 2),
        latitude: lat,
        longitude: lng,
        amenities: ['Diesel', 'Showers', 'Parking', 'DEF', 'Full Service', 'Scales'],
      });
    }
  } catch (e) {
    console.error('TA/Petro fetch error:', e);
    throw e;
  }
  return stops;
}

// ===== UPSERT to database =====
async function upsertStops(supabase: any, stops: StopRecord[]): Promise<number> {
  if (stops.length === 0) return 0;
  let upserted = 0;
  
  // Batch in chunks of 200
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

    // Auth check - must be super admin
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

    // Check super admin
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin' as any);
    // The RPC uses auth context so we need to check via the auth client
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: isAdmin } = await supabaseUserClient.rpc('is_super_admin' as any);
    
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Sync triggered by super admin: ${user.email}`);

    const results: Record<string, number> = {};
    const errors: string[] = [];

    // Fetch from each brand independently
    const brands: Array<{ name: string; fetcher: () => Promise<StopRecord[]> }> = [
      { name: 'Pilot/Flying J', fetcher: fetchPilotFlyingJ },
      { name: "Love's", fetcher: fetchLoves },
      { name: 'TA/Petro', fetcher: fetchTAPetro },
    ];

    for (const brand of brands) {
      try {
        console.log(`Fetching ${brand.name}...`);
        const stops = await brand.fetcher();
        console.log(`${brand.name}: fetched ${stops.length} stops`);
        
        if (stops.length > 0) {
          const count = await upsertStops(supabase, stops);
          results[brand.name] = count;
        } else {
          results[brand.name] = 0;
          errors.push(`${brand.name}: No stops returned (endpoint may have changed)`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${brand.name}: ${msg}`);
        results[brand.name] = 0;
        console.error(`${brand.name} sync failed:`, msg);
      }
    }

    // Get total count
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
