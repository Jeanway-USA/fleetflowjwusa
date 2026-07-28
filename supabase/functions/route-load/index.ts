import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface LatLng { lat: number; lng: number }

interface Body {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/mapbox';

function isLatLng(v: any): v is LatLng {
  return v && typeof v.lat === 'number' && typeof v.lng === 'number' &&
    Number.isFinite(v.lat) && Number.isFinite(v.lng);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
    }

    // Require an authenticated caller before spending paid Mapbox/connector quota.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const MAPBOX_API_KEY = Deno.env.get('MAPBOX_API_KEY');
    if (!LOVABLE_API_KEY || !MAPBOX_API_KEY) {
      return new Response(JSON.stringify({ error: 'Mapbox connector not configured' }), { status: 500, headers: jsonHeaders });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !isLatLng(body.origin) || !isLatLng(body.destination)) {
      return new Response(JSON.stringify({ error: 'Invalid origin/destination' }), { status: 400, headers: jsonHeaders });
    }
    const waypoints = Array.isArray(body.waypoints) ? body.waypoints.filter(isLatLng).slice(0, 23) : [];

    const points: LatLng[] = [body.origin, ...waypoints, body.destination];
    const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(';');

    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'full',
      annotations: 'congestion,distance',
      exclude: 'ferry',
      steps: 'false',
    });

    const url = `${GATEWAY_URL}/directions/v5/mapbox/driving-traffic/${coordStr}?${params.toString()}`;
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': MAPBOX_API_KEY,
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`Mapbox directions failed [${upstream.status}]: ${text}`);
      return new Response(
        JSON.stringify({ error: 'Directions request failed', status: upstream.status, details: text }),
        { status: upstream.status, headers: jsonHeaders },
      );
    }

    const data = await upstream.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates) {
      return new Response(JSON.stringify({ error: 'No route found' }), { status: 404, headers: jsonHeaders });
    }

    // GeoJSON coords are [lng, lat] — convert to [lat, lng] to match existing storage.
    const geometry: [number, number][] = (route.geometry.coordinates as [number, number][])
      .map(([lng, lat]) => [lat, lng] as [number, number]);

    // Congestion: aggregate across legs. Length = geometry.length - 1 segments.
    const congestion: string[] = [];
    for (const leg of route.legs ?? []) {
      const legCong = leg?.annotation?.congestion;
      if (Array.isArray(legCong)) {
        for (const c of legCong) congestion.push(typeof c === 'string' ? c : 'unknown');
      }
    }

    return new Response(
      JSON.stringify({
        geometry,
        congestion,
        distance_m: Math.round(route.distance ?? 0),
        duration_s: Math.round(route.duration ?? 0),
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: any) {
    console.error('route-load error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
