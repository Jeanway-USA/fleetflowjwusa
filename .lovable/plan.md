## Dynamic Route Recalculation from Live GPS

Make the active route line on the dispatcher map, public tracker, and driver HUD redraw automatically as the driver moves, using their live GPS position as the new origin and the load's destination as the endpoint.

### 1. Schema (migration)

Add to `public.fleet_loads`:
- `current_route_geometry jsonb` — array of `[lat, lng]` tuples (the recalculated path).
- `current_route_origin jsonb` — `{ lat, lng }` of the GPS point that produced it (for the distance-threshold check).
- `current_route_updated_at timestamptz`.

Enable realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_loads;` (and `REPLICA IDENTITY FULL` so UPDATE payloads carry the new geometry).

RLS already covers `fleet_loads`; the driver-column-restriction trigger must be amended to whitelist these 3 new fields so the assigned driver can write them.

### 2. Recalculation trigger (driver client)

In `LocationSharing.tsx` `handlePositionUpdate`:
- After each GPS fix where `loadId` is set, compute `haversine(newPos, lastCachedOrigin)`.
- If `>= 0.5 miles` (or no cached origin yet) **and** at least 60 s since the last recalc, fire a debounced recalc job.
- Keep this independent of the existing 10-minute `driver_locations` upsert — geometry refresh has its own threshold.

Recalc job (new helper `src/lib/recalcActiveRoute.ts`):
1. Load the load's `destination_full` (or `destination`) and geocode it (existing `geocodeLocation` in `src/lib/geocoding.ts`); cache per load id.
2. Call `fetchRoute({lat,lng}, destinationCoords)` from `src/lib/routing.ts` (OSRM, our existing provider).
3. `supabase.from('fleet_loads').update({ current_route_geometry, current_route_origin, current_route_updated_at }).eq('id', loadId)`.
4. On failure (OSRM down, geocode miss), leave previous geometry untouched — consumers fall back to the static origin→destination route.

### 3. Universal realtime sync (consumers)

New shared hook `src/hooks/useActiveLoadRoute.ts`:
- Input: `loadId`, plus static `origin`/`destination` fallbacks.
- Reads `current_route_geometry` from `fleet_loads` on mount.
- Subscribes via `supabase.channel(...).on('postgres_changes', { event: 'UPDATE', table: 'fleet_loads', filter: 'id=eq.<loadId>' })` and updates local state on each payload.
- Returns `{ geometry, isLive }` where `isLive=true` when geometry came from realtime/db rather than static fallback.

Wire into three components:
- **`src/components/driver/LoadRouteMap.tsx`** — accept optional `loadId`; when geometry from hook is present, draw it instead of the locally-fetched `fetchRouteWithWaypoints` result; pin a "Live route" badge when `isLive`.
- **`src/components/dispatcher/FleetMapView.tsx`** — for loads that have `current_route_geometry`, prefer it over the `fetchRoutesBatch` static result; subscribe through the same hook (one channel for all visible loads, filtered by `id=in.(...)`).
- **`src/pages/PublicLoadTracker.tsx`** — pass `loadId` through to `LoadRouteMap`; the public tracker reads from the existing `public-load-tracker` edge function — extend that function's `select` to include `current_route_geometry` and update the response type.

### 4. Public tracker realtime

`PublicLoadTracker.tsx` cannot use authenticated realtime (no JWT). Use a polling fallback: re-invoke `public-load-tracker` every 30 s while the page is open. (Adding anon realtime to `fleet_loads` would leak data across orgs.)

### Technical notes

- Distance threshold: `0.5 mi` via haversine in `src/lib/geocoding.ts` (already has `haversineMiles`-like utilities — reuse or add).
- Debounce: `setTimeout` ref; recalcs are coalesced so rapid GPS bursts produce one OSRM call.
- Cache hit: `routing.ts` already keys by rounded coords; identical successive recalcs cost zero API calls.
- No new secrets — OSRM is the existing provider.

### Out of scope

- Switching providers (Mapbox/Google) — keeping OSRM per `mem://features/maps/routing-and-infrastructure`.
- Historical route playback UI (data will be persisted but viewer not built here).
- Re-routing through intermediate stops — recalc treats remaining trip as origin → final destination only.