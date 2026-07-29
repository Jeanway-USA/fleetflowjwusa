import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/mapbox';
const MAX_ADDRESSES = 25;

interface GeocodeResult {
  query: string;
  lat: number | null;
  lng: number | null;
  precision: 'address' | 'city' | null;
}

// Mapbox v6 "feature type" -> our coarse precision flag
function precisionFor(featureType: string | undefined): 'address' | 'city' {
  switch (featureType) {
    case 'address':
    case 'street':
    case 'poi':
    case 'secondary_address':
      return 'address';
    default:
      return 'city';
  }
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

    const body = (await req.json().catch(() => null)) as { addresses?: unknown } | null;
    const raw = Array.isArray(body?.addresses) ? body!.addresses : null;
    if (!raw) {
      return new Response(JSON.stringify({ error: 'addresses must be a non-empty array of strings' }), { status: 400, headers: jsonHeaders });
    }
    const addresses = raw
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map((a) => a.trim().slice(0, 300))
      .slice(0, MAX_ADDRESSES);
    if (addresses.length === 0) {
      return new Response(JSON.stringify({ error: 'addresses must be a non-empty array of strings' }), { status: 400, headers: jsonHeaders });
    }

    const results: GeocodeResult[] = [];

    for (const query of addresses) {
      const params = new URLSearchParams({
        q: query,
        country: 'us',
        limit: '1',
        types: 'address,place',
        autocomplete: 'false',
      });
      const url = `${GATEWAY_URL}/search/geocode/v6/forward?${params.toString()}`;
      const upstream = await fetch(url, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': MAPBOX_API_KEY,
        },
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        console.error(`Mapbox geocoding failed [${upstream.status}] for "${query}": ${text}`);
        // A hard auth/config failure should surface; per-query misses should not.
        if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
          return new Response(
            JSON.stringify({ error: 'Geocoding request failed', status: upstream.status, details: text }),
            { status: upstream.status, headers: jsonHeaders },
          );
        }
        results.push({ query, lat: null, lng: null, precision: null });
        continue;
      }

      const data = await upstream.json();
      const feature = data?.features?.[0];
      const coords = feature?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        results.push({
          query,
          lng: Number(coords[0]),
          lat: Number(coords[1]),
          precision: precisionFor(feature?.properties?.feature_type),
        });
      } else {
        results.push({ query, lat: null, lng: null, precision: null });
      }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: jsonHeaders });
  } catch (err: any) {
    console.error('geocode-address error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
