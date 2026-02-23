
## Fix: Fuel Planner Missing Stops Along Route

### Root Cause

**Race condition in query timing**: The `useQuery` in `TripFuelPlanner.tsx` (line 106) has this key:

```
queryKey: ['fuel-stops', driverId, originCoords?.lat, destCoords?.lat, geocodedStops.length]
```

It does NOT include `routeCoords`. The query becomes enabled when `geocoding` turns false, but the `routeCoords` state variable (read on line 115) may still be `null` at that moment. Since `routeCoords` isn't in the key, the query never re-runs when the OSRM polyline arrives. Result: the backend receives an empty/undefined `route_polyline` and falls back to origin-to-destination straight-line filtering -- only finding stops near the two endpoints.

**Secondary issue**: The hardcoded `KNOWN_STOPS` array only has ~40 entries. Routes through less-covered areas return zero results even with correct filtering.

---

### Fix 1: Frontend -- Wait for Route Before Querying (TripFuelPlanner.tsx)

**Change the query to depend on `routeCoords`:**

- Add `routeCoords?.length` to the `queryKey` array so the query re-fetches when the polyline arrives.
- Add `!!routeCoords` to the `enabled` condition so the query doesn't fire until the OSRM route is ready. This guarantees the backend always receives the full polyline.
- Keep a fallback: if routeCoords fails to load after 10 seconds, allow query without it (to handle OSRM outages gracefully). This is done via a `routeTimeout` state that flips to `true` after a delay.

**Reduce default corridor from 25mi to 15mi** since true polyline filtering is much more precise than straight-line fallback (no need for the wide buffer).

---

### Fix 2: Backend -- Chunked Sampling for Dense Coverage (landstar-fuel-stops/index.ts)

Add a `sampleRoutePoints()` function that generates evenly-spaced sample coordinates every ~50 miles along the polyline. For each sampled point, query the `KNOWN_STOPS` (and cache) using a wider per-chunk radius, then merge and deduplicate.

This means a 500-mile route produces ~10 sample points, each searching within 25mi, covering the full corridor rather than just the bounding box.

**Changes to the edge function:**

1. Add `sampleRoutePoints(polyline, intervalMiles)` utility that walks the polyline accumulating haversine distance and emits a coordinate every `intervalMiles`.

2. Before filtering, expand `KNOWN_STOPS` coverage: for each sampled point, include any stop within `corridor_miles` of that sample. This is functionally equivalent to the existing `distanceToPolyline` check but ensures the bounding-box cache query (lines 427-439) doesn't prematurely exclude stops that are along the middle of the route but outside the simple lat/lng bounding box.

3. Fix bounding box calculation for cache query: currently uses `corridor_miles / 69` for latitude padding but only `corridor_miles / 54` for longitude. For routes that curve significantly (e.g., I-10 Houston to Jacksonville), the simple min/max bounding box of origin+dest misses the middle of the route. Instead, compute the bounding box from ALL polyline points (or sampled points).

---

### Fix 3: Backend -- Expand Bounding Box from Polyline

The cache query (lines 425-439) currently computes a bounding box from just `[origin, dest, waypoints]`. For a curved 800-mile route, the midpoint of the actual highway could be hundreds of miles outside this box.

**Fix**: When `route_polyline` is provided, compute the bounding box from the polyline points instead:

```
if (route_polyline && route_polyline.length > 0) {
  allLats = route_polyline.map(p => p[0]);
  allLngs = route_polyline.map(p => p[1]);
}
```

This ensures the cache query covers the entire route corridor.

---

### Summary of File Changes

| File | Changes |
|------|---------|
| `src/components/driver/TripFuelPlanner.tsx` | Add `routeCoords?.length` to queryKey; add `!!routeCoords` to enabled with timeout fallback; reduce corridor to 15mi |
| `supabase/functions/landstar-fuel-stops/index.ts` | Fix bounding box to use polyline points; add `sampleRoutePoints()` for chunked coverage; no behavior change when polyline is absent |
| `src/components/driver/fuel-planner/FuelPlannerMap.tsx` | No changes needed -- already handles all marker types correctly |

### Technical Detail: Query Timing Fix

```text
BEFORE (broken):
  geocode origin/dest --> query fires (routeCoords = null) --> polyline = undefined --> straight-line fallback
  OSRM route arrives --> routeCoords set --> query does NOT re-run (not in key)

AFTER (fixed):
  geocode origin/dest --> routeCoords still null --> query disabled
  OSRM route arrives --> routeCoords set --> query key changes --> query fires with full polyline
```
