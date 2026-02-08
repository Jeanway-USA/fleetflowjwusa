

## Plan: Fix Route Caching Race Condition for Intermediate Stops

### Problem

The intermediate stops are already parsed and geocoded, but there is a **race condition** that prevents them from being included in the route:

1. Origin and destination addresses geocode quickly (2 addresses)
2. The route-fetching effect fires as soon as `geocodedCoords` changes
3. At that point, only origin/dest are geocoded -- the 7 intermediate stop addresses have not been geocoded yet
4. The route is fetched from OSRM with just origin-to-destination (no waypoints)
5. On line 288 of `FleetMapView.tsx`: `if (routeGeometries.has(load.id)) return;` -- this skips re-fetching the route once intermediate stops are geocoded later
6. The same issue exists in the in-memory route cache in `routing.ts` -- a different cache key is used for origin-to-dest vs origin-to-waypoints-to-dest, but since the route is already stored in `routeGeometries` state, a second OSRM call is never made

**Result**: The OSRM route is drawn as a direct origin-to-destination path, completely ignoring intermediate stops. You can verify this in the network requests -- the OSRM URL only contains two coordinate pairs.

---

### Fix

The fix involves two changes in `FleetMapView.tsx`:

**Change 1: Wait for all stop addresses to be geocoded before fetching routes**

In the route-fetching `useEffect` (line 280), add a guard that checks whether all intermediate stop addresses for a load have been geocoded before attempting to fetch that load's route. If a load has stops but not all of them are geocoded yet, skip it for now -- the effect will re-run when more geocoded coordinates arrive.

```
// For each load with stops, check if ALL stops are geocoded
const stops = loadStops.get(load.id) || [];
const allStopsGeocoded = stops.every(s => geocodedCoords.has(s.address));
if (stops.length > 0 && !allStopsGeocoded) return; // wait for more geocoding
```

**Change 2: Remove the early-exit cache check that prevents re-fetching**

Remove the line `if (routeGeometries.has(load.id)) return;` -- this prevents routes from ever being updated. Instead, use a smarter cache key that includes the number of resolved waypoints, so routes are re-fetched when new waypoints become available.

Specifically, build a route key per load that includes the waypoint count. Store and compare against this key so that:
- A route fetched with 0 waypoints will be re-fetched when 7 waypoints become available
- A route fetched with 7 waypoints will not be re-fetched again

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/dispatcher/FleetMapView.tsx` | Fix the route-fetching effect to wait for all stops to geocode and allow re-fetching when waypoints change |

No other files need changes -- `LoadRouteMap.tsx` and `TripFuelPlanner.tsx` use a single sequential flow (geocode all, then fetch route) so they don't have this race condition. Only `FleetMapView` has the issue because it uses separate effects for geocoding and route fetching.

---

### Technical Details

The route-fetching `useEffect` will be updated as follows:

1. Add a `routeKeys` ref or state that maps load ID to a string like `"loadId:waypointCount"` to track what version of the route was fetched
2. When building the pairs array, compute the waypoint count for each load
3. Skip a load only if its current route key matches (same waypoint count as last fetch)
4. After fetching, update the route keys map
5. Add the guard: if a load has intermediate stops but not all are geocoded yet, skip it entirely (do not fetch a partial route)

This ensures:
- Routes without stops are fetched immediately (no waiting)
- Routes with stops wait until all stop addresses are geocoded
- If a route was previously fetched without stops (shouldn't happen with the guard, but as a safety net), it gets re-fetched once stops are available

