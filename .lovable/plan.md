## Audit result: persistence already works

The live route is already persisted to Supabase and consumed by all three views. The column is named **`current_route_geometry`** (semantically equivalent to your requested `active_route_geometry`).

### Task 1 — DB column ✅
`supabase/migrations/20260614003343_…sql` already added to `public.fleet_loads`:
- `current_route_geometry jsonb` — array of `[lat, lng]` tuples
- `current_route_origin jsonb` — GPS point that produced the geometry
- `current_route_updated_at timestamptz` — last recalc time
- `REPLICA IDENTITY FULL` + added to `supabase_realtime` publication
- The driver column-restriction trigger explicitly whitelists these three columns so the assigned driver can write them.

### Task 2 — Save on GPS update ✅
`src/components/driver/LocationSharing.tsx` (line 124) calls `maybeRecalcRoute(loadId, {lat, lng})` on every accepted GPS fix.

`src/lib/recalcActiveRoute.ts`:
- Throttles: ≥0.5 mi moved, ≥60 s elapsed, 4 s debounce.
- Geocodes the destination (cached per load).
- Calls OSRM via `fetchRoute(origin, dest)`.
- `supabase.from('fleet_loads').update({ current_route_geometry, current_route_origin, current_route_updated_at }).eq('id', loadId)`.

### Task 3 — Universal read ✅
- **Driver page** — `src/components/driver/LoadRouteMap.tsx` uses `useActiveLoadRoute(loadId)` which (a) does an initial `SELECT current_route_geometry,…` and (b) subscribes via realtime `postgres_changes` on `fleet_loads`. Falls back to the static origin→destination route only when `geometry` is null.
- **Dispatcher page** — `src/components/dispatcher/FleetMapView.tsx` selects `current_route_geometry` in its loads query, seeds `liveRouteGeometries` from the DB on initial load, and subscribes to `fleet_loads` UPDATEs to refresh that map. The route layer prefers `liveRouteGeometry` over the static OSRM polyline.
- **Public tracker** — `supabase/functions/public-load-tracker/index.ts` selects and returns `current_route_geometry`/`current_route_updated_at`; `src/pages/PublicLoadTracker.tsx` passes it down as `liveGeometry`, so the public link draws the persisted live route on refresh too.

### What this means for your bug report
If a refresh is still showing the static route, the geometry simply was not saved yet for that load (e.g. driver had not started sharing GPS, or the throttle gates had not yet fired). Once `maybeRecalcRoute` posts a successful update, all three surfaces will draw the saved geometry on refresh and update live via realtime.

### Optional follow-ups (only if you want them — say the word)
1. **Rename** `current_route_geometry` → `active_route_geometry` across DB column, migration, edge function, types, and 4 client files. Cosmetic only; no behavior change.
2. **Telemetry** — add a `console.info` / toast on successful save + a `last_updated` badge on the dispatcher map so you can visibly confirm persistence is firing.
3. **Tighten throttle** — drop `MIN_DISTANCE_MILES` from 0.5 → 0.1 and `MIN_INTERVAL_MS` from 60 s → 20 s so a stationary refresh test shows updates faster (uses more OSRM quota).

Tell me which (if any) of 1–3 you want and I'll switch to build mode.