# Fix: Route doesn't update when driver's live location is on

## Why this is broken today

Two paths exist to update the green route line as the driver moves:

1. **Driver-side recalc** (`src/lib/recalcActiveRoute.ts`) writes `fleet_loads.current_route_geometry` from the driver's browser.
2. **Dispatcher map** (`src/components/dispatcher/FleetMapView.tsx`) subscribes to `fleet_loads` UPDATEs and re-renders the polyline.

Inspection of the live in-transit load (`status=in_transit`, driver actively sharing GPS at 30.86,-102.08) shows `current_route_geometry IS NULL` and `current_route_updated_at IS NULL`. The driver-side recalc is silently failing or never reaching the point of writing — it depends on `navigator.geolocation.watchPosition` firing repeatedly, a 4 s debounce, async geocoding of the destination string, and an OSRM round-trip, all from the driver's browser. Any one of those failing leaves the dispatcher map showing the original origin→destination route forever, exactly what the screenshot shows.

We also have no realtime publication entry for `fleet_loads`, so even if the row were updated, the dispatcher map's `postgres_changes` subscription would not fire reliably.

The robust fix is to stop depending on the driver's browser as the single source of truth and recompute the route on the dispatcher side from the driver's last known GPS fix (which we already have in `driver_locations` and which already streams via realtime).

## Plan

### 1. Dispatcher-side live route recalculation
In `src/components/dispatcher/FleetMapView.tsx`:

- For each in-transit load whose assigned `driver_id` has a `driver_locations` row that is "live" (already computed via `isLocationLive`), call `fetchRoute({lat, lng}, destCoords)` and store the result in `liveRouteGeometries` under that load's id.
- Throttle per load: skip if the driver has moved less than ~0.5 mi since the last computed origin, or if less than 60 s have passed. Reuse the math from `src/lib/recalcActiveRoute.ts` (haversine + min-distance/min-interval gates) — extract those constants into a tiny shared helper so both paths stay aligned.
- Re-run the effect whenever `driverLocations` or `geocodedCoords` change so each realtime GPS update can redraw the polyline. The polyline render at lines 487–504 already prefers `load.liveRouteGeometry` over the static OSRM route, so no rendering changes are needed once `liveRouteGeometries` is populated.

### 2. Keep the driver-side recalc as a best-effort secondary
Leave `recalcActiveRoute.ts` and the `LocationSharing` hook intact — they still help when the dispatcher tab is closed — but the dispatcher map will no longer rely on them.

### 3. Ensure realtime delivery for the existing subscription
Add a migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_loads;
ALTER TABLE public.fleet_loads REPLICA IDENTITY FULL;
```

This makes the existing `fleet-loads-route-realtime` channel actually receive UPDATE payloads when driver-side recalc does succeed, so both paths converge on the same state.

### 4. Verification
- Confirm with `supabase--read_query` that `fleet_loads` is in `supabase_realtime` after the migration.
- Open the dispatcher map with the existing in-transit load: the green polyline should redraw from the truck marker (West Texas) to the destination (Columbus, TX) rather than from Albuquerque to Columbus.
- Toggle the driver's GPS off and confirm the polyline falls back to the static origin→destination route after the live location goes stale.

## Files touched

- `src/components/dispatcher/FleetMapView.tsx` — new effect that recomputes `liveRouteGeometries` from `driverLocations` + `geocodedCoords`.
- `src/lib/recalcActiveRoute.ts` — export the throttle helpers (haversine, distance/time gates) so the dispatcher path can reuse them. No behavior change for the driver path.
- New migration under `supabase/migrations/` adding `fleet_loads` to `supabase_realtime` with `REPLICA IDENTITY FULL`.
