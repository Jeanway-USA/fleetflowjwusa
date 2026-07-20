
## Goal

On the dispatcher In-Transit map (Mapbox), each active load should get an automatically-drawn truck-friendly route. The Traffic toggle should color that route by real congestion (not just the global traffic tile layer). Live truck GPS pings should render on the route. And the Weather Radar overlay should work again.

## Current state (verified)

- `src/components/dispatcher/FleetMapView.tsx` currently draws routes as **straight lines** between origin and destination (lines 810–815), only replaced by a real polyline if `fleet_loads.current_route_geometry` was pre-populated. Nothing in the app is actively populating that column for in-transit loads.
- Traffic layer is the global `mapbox.mapbox-traffic-v1` vector tiles — it shows all roads, not per-route congestion.
- Truck marker uses raw `driver_locations` lat/lng with no snap to route.
- Weather radar loads the RainViewer index and appends a raster source. The switch to the raster-fallback base style (recent fix) does not break CSP (`api.rainviewer.com`, `tilecache.rainviewer.com` are whitelisted) but the layer is being added before the fallback style's `styleReady` re-fires in some cases, causing the radar to silently fail to appear. Also, the raster tile URL currently uses `2/1_1.png` (color scheme 2, smooth+snow); the previous working version used color scheme 4 with `1_1` which is more visible on the light basemap.

## Changes

### 1. New edge function `route-load` (Mapbox Directions API via gateway)

- POST `{ origin: {lat,lng}, destination: {lat,lng}, waypoints?: [{lat,lng}] }`.
- Calls `https://connector-gateway.lovable.dev/mapbox/directions/v5/mapbox/driving-traffic/{coords}?geometries=geojson&overview=full&annotations=congestion,distance&exclude=ferry` using `LOVABLE_API_KEY` + `MAPBOX_API_KEY`.
- Uses `driving-traffic` profile (closest thing Mapbox offers to a truck profile — avoids ferries, honors real-time traffic) with `exclude=ferry`. This is the same category the previous OSRM integration used, but with per-segment congestion data.
- Returns `{ geometry: [[lat,lng], ...], congestion: ['low'|'moderate'|'heavy'|'severe'|'unknown', ...], distance_m, duration_s }`.
- Surfaces provider status/body on failure (per gateway conventions).

### 2. DB: extend `fleet_loads` route cache

Migration adds:
- `current_route_congestion jsonb` — array of congestion strings aligned to `current_route_geometry` segments.
- `current_route_distance_m integer`, `current_route_duration_s integer` — for future ETA.

RLS unchanged (columns inherit existing policies). GRANTs already in place on `fleet_loads`.

### 3. Client: auto-fetch routes for in-transit loads

In `FleetMapView.tsx`:
- New hook `useLoadRoutes(loads)`: for every in-transit load with resolved `originCoords` + `destCoords` and no fresh `current_route_geometry` (older than 30 min or missing), call the `route-load` edge function once, then persist the returned geometry/congestion back to `fleet_loads` (single UPDATE per load, throttled). Existing realtime subscription already picks up the update and re-renders.
- Multi-stop loads pass intermediate stops as Directions waypoints in order.
- Failed calls fall back to the current straight-line rendering, so the map never regresses.

### 4. Route rendering: congestion-colored when Traffic toggle is on

Rework the `load-routes` layer so each route is a set of small `LineString` features per segment, each carrying a `congestion` property. Two paint modes controlled by `overlays.traffic`:
- **Off** — solid green line (`LIVE_ROUTE_COLOR` for live, `LOAD_STATUS_COLOR` otherwise), width behavior unchanged.
- **On** — color per segment: `low #22c55e`, `moderate #eab308`, `heavy #f97316`, `severe #dc2626`, `unknown #94a3b8`. Global `mapbox-traffic-v1` tile layer stays available but is dimmed (opacity halved) so the per-route colors read clearly.

Selection width bump (`selectedLoadId`) still applies via `line-width` case expression.

### 5. Snap live trucks to route

Add `snapPointToRoute(truckLatLng, routeCoords)` (Turf-free, just a nearest-point-on-polyline routine — no new dependency). For each load with `truckCoords` and a route geometry:
- Compute snapped position.
- Feed the snapped `[lng, lat]` into the `trucks` GeoJSON source instead of the raw coordinate.
- Keep the `live` boolean based on `is_sharing` + freshness (unchanged).

Trucks without a live route continue to render at raw location (current behavior).

### 6. Weather radar fix

- Move radar layer setup to also run on the `styledata` event, and guard with `map.isStyleLoaded()` — re-adds the layer after the fallback style swap.
- Switch RainViewer path from `.../2/1_1.png` to `.../4/1_1.png` (color scheme 4 = "Universal Blue", used previously and visible on light basemap) and keep smoothed+snow flags.
- Ensure the layer is inserted **above** `mapbox-base` but **below** `load-routes-lyr` so routes/trucks stay visible.
- Add a one-shot `toast.info('Weather radar loaded')` only on the first successful frame to confirm to the user; keep silent on refresh.

### 7. Legend

Extend the existing overlay legend to show the congestion swatches when Traffic is on, and a "Route" row when routes exist. Cosmetic-only, no new dependencies.

## Technical details

- Files touched:
  - `supabase/functions/route-load/index.ts` (new) + `supabase/config.toml` entry.
  - Migration: `alter table public.fleet_loads add column ...` (no new RLS/GRANTs needed).
  - `src/components/dispatcher/FleetMapView.tsx` — routes, trucks, weather layer wiring, new hook.
  - `src/lib/geo/snapToRoute.ts` (new) — pure helper.
- Rate control: route fetches are keyed by load id + coord hash; a load already having `current_route_updated_at` within 30 min is skipped.
- No frontend Mapbox token change; Directions call is server-side only.
- OSRM path stays fully removed — one routing provider (Mapbox) end to end.

## Out of scope

- ETA recomputation UI, driver-facing route display, and turn-by-turn instructions.
- A true HAZMAT/weight-restricted "truck" routing profile (Mapbox does not offer it publicly; `driving-traffic` with ferry exclusion is the closest fit).
