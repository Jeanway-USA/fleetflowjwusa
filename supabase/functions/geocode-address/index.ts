import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/mapbox';
const MAX_ADDRESSES = 25;

interface GeocodeResult {
  query: string;
  lat: number | null;
  lng: number | null;
  precision: 'address' | 'city' | null;
  matched?: string | null;
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

// Split "Fenway Park, 4 Yawkey Way, Boston, MA 02215-3409" into structured pieces.
// A leading business-name segment (no house number) is dropped.
function parseAddressParts(address: string): {
  street?: string;
  city?: string;
  state?: string;
  postal?: string;
} {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  let state: string | undefined;
  let postal: string | undefined;
  let stateIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/);
    if (m) {
      state = m[1].toUpperCase();
      postal = m[2];
      stateIdx = i;
      break;
    }
    const m2 = parts[i].match(/^(.+?)\s+([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/);
    if (m2) {
      state = m2[2].toUpperCase();
      postal = m2[3];
      stateIdx = i;
      break;
    }
  }

  if (stateIdx === -1) return {};

  const city = stateIdx > 0 ? parts[stateIdx - 1] : undefined;
  // The street is the part before the city that starts with a house number.
  let street: string | undefined;
  for (let i = stateIdx - 2; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      street = parts[i];
      break;
    }
  }
  // No numbered street found: use the segment right before the city if it isn't
  // obviously a business name only (single token names are usually POIs).
  if (!street && stateIdx - 2 >= 0) street = parts[stateIdx - 2];

  return { street, city, state, postal };
}

async function mapboxForward(
  params: Record<string, string>,
  lovableKey: string,
  mapboxKey: string,
): Promise<{ ok: true; data: any } | { ok: false; status: number; text: string }> {
  const qs = new URLSearchParams({ country: 'us', limit: '1', autocomplete: 'false', ...params });
  const upstream = await fetch(`${GATEWAY_URL}/search/geocode/v6/forward?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': mapboxKey,
    },
  });
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, text: await upstream.text() };
  }
  return { ok: true, data: await upstream.json() };
}

function coordsOf(feature: any): { lat: number; lng: number } | null {
  const c = feature?.geometry?.coordinates;
  if (Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    return { lat: Number(c[1]), lng: Number(c[0]) };
  }
  return null;
}

// A street match in the wrong city is worse than a city centroid.
function isTrustworthyAddressMatch(feature: any): boolean {
  const mc = feature?.properties?.match_code;
  if (!mc) return true; // no match metadata (e.g. place results) -> nothing to reject on
  if (mc.confidence === 'low') return false;
  if (mc.place === 'unmatched') return false;
  return true;
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
    let fatal: { status: number; text: string } | null = null;

    for (const query of addresses) {
      const { street, city, state, postal } = parseAddressParts(query);

      // 1. Structured lookup — keeps Mapbox from matching a same-named street
      //    in a different city (e.g. "4 Yawkey Way" resolving to Nantucket).
      let feature: any = null;
      if (street && city && state) {
        const res = await mapboxForward(
          {
            address_line1: street,
            place: city,
            region: state,
            ...(postal ? { postcode: postal } : {}),
          },
          LOVABLE_API_KEY,
          MAPBOX_API_KEY,
        );
        if (!res.ok) {
          console.error(`Mapbox structured geocoding failed [${res.status}] for "${query}": ${res.text}`);
          if (res.status === 401 || res.status === 402 || res.status === 403) fatal = res;
        } else {
          const f = res.data?.features?.[0];
          if (f && coordsOf(f) && isTrustworthyAddressMatch(f)) feature = f;
          else if (f) {
            console.warn(`Rejected low-confidence match for "${query}": ${f?.properties?.full_address}`);
          }
        }
      }

      // 2. Free-text fallback when the address could not be parsed.
      if (!feature && !fatal && !(street && city && state)) {
        const res = await mapboxForward(
          { q: query, types: 'address,place' },
          LOVABLE_API_KEY,
          MAPBOX_API_KEY,
        );
        if (!res.ok) {
          console.error(`Mapbox geocoding failed [${res.status}] for "${query}": ${res.text}`);
          if (res.status === 401 || res.status === 402 || res.status === 403) fatal = res;
        } else {
          const f = res.data?.features?.[0];
          if (f && coordsOf(f) && isTrustworthyAddressMatch(f)) feature = f;
        }
      }

      // 3. City centroid — wrong by a few miles beats wrong by an island.
      if (!feature && !fatal && city && state) {
        const res = await mapboxForward(
          { q: `${city}, ${state}`, types: 'place' },
          LOVABLE_API_KEY,
          MAPBOX_API_KEY,
        );
        if (res.ok) {
          const f = res.data?.features?.[0];
          if (f && coordsOf(f)) {
            const c = coordsOf(f)!;
            results.push({
              query,
              lat: c.lat,
              lng: c.lng,
              precision: 'city',
              matched: f?.properties?.full_address ?? null,
            });
            continue;
          }
        }
      }

      if (fatal) {
        return new Response(
          JSON.stringify({ error: 'Geocoding request failed', status: fatal.status, details: fatal.text }),
          { status: fatal.status, headers: jsonHeaders },
        );
      }

      const coords = feature ? coordsOf(feature) : null;
      if (coords) {
        results.push({
          query,
          lat: coords.lat,
          lng: coords.lng,
          precision: precisionFor(feature?.properties?.feature_type),
          matched: feature?.properties?.full_address ?? null,
        });
      } else {
        results.push({ query, lat: null, lng: null, precision: null, matched: null });
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
