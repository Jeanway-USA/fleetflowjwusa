## Problem

Loads already store full street addresses in `fleet_loads.origin` / `destination` (e.g. `Set Epes Yard, 4455 Lansing Dr, Winston Salem, NC 27105-2924`), but `src/lib/geocoding.ts` throws the street away before geocoding: `geocodeWithNominatim()` calls `extractCityState(address)` and queries Nominatim with only `"Winston Salem, NC"`. Every pin and route endpoint therefore lands on the city centroid.

Every map surface shares this one function — the dispatcher Mapbox map, the driver `LoadRouteMap`, and the public tracker — so fixing it centrally fixes all of them.

## Fix

### 1. Precise geocoding via a Mapbox edge function
Mapbox Geocoding handles US street addresses and POI names far better than Nominatim, and the project already holds a Mapbox **secret** token used by `supabase/functions/route-load`.

Add `supabase/functions/geocode-address/index.ts`:
- Requires a valid JWT (same pattern as the hardened `route-load` function).
- Accepts `{ addresses: string[] }` (batched, capped at ~25 per call).
- Calls Mapbox Geocoding v6 `/search/geocode/v6/forward` through the connector gateway with the secret token, `country=us`, `limit=1`, `types=address,poi,place`.
- Returns `{ results: { query, lat, lng, accuracy }[] }`, where `accuracy` reflects whether Mapbox matched a rooftop/street point or fell back to a place centroid.
- Surfaces provider status/body on non-OK responses.

### 2. Rework `src/lib/geocoding.ts` into a precision-first cascade
Keep the existing exported API (`geocodeLocationAsync`, `geocodeLocation`, `geocodeBatch`, `interpolatePosition`, `getProgressFromStatus`) so no call site changes shape. Internally:

1. Session cache (unchanged, keyed on normalized full address).
2. **Mapbox edge function on the full address** — the new primary path.
3. **Nominatim on the full address** (structured query with street/city/state/postcode parsed out) — fallback when Mapbox is unavailable or returns nothing.
4. **Nominatim on `extractCityState(...)`** — existing behavior, now last resort only.
5. Hardcoded `cityFallbacks` — unchanged final fallback.

`extractCityState` stays but is demoted to step 4. Results carry a `precision` flag (`'address' | 'city'`) so callers can tell a real address hit from a centroid; the cache stores it too.

### 3. Re-route loads whose stored geometry was built from centroids
`FleetMapView`'s auto-fetch skips any load that already has `current_route_geometry`, so existing loads would keep their old city-to-city lines. Use the existing `current_route_origin` jsonb column: when the freshly geocoded origin/destination differs from the stored route origin by more than ~0.5 mi, treat the stored route as stale and re-request `route-load`. Same staleness check applies to the driver-side route fetch.

### 4. Marker positions
No component changes needed beyond the staleness check — `originCoords` / `destCoords` / stop coords all flow from `geocodeLocationAsync`, so pins move to the exact address automatically once the geocoder is precise.

## Files touched

- `supabase/functions/geocode-address/index.ts` (new)
- `src/lib/geocoding.ts` (cascade rewrite, same exports)
- `src/components/dispatcher/FleetMapView.tsx` (stale-route detection against `current_route_origin`)

## Verification

Pick a live load with a specific street address (e.g. the Winston Salem yard), load the dispatcher dashboard headless, and confirm the origin pin and route endpoint sit on the street address rather than downtown — plus check the driver load map and public tracker for the same load.

## Note

Mapbox Geocoding bills per request. The session cache plus the existing DB-persisted route geometry keeps repeat lookups off the API, but every distinct new address costs one geocoding call.
