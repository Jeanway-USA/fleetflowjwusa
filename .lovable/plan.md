

## Plan: Send Waypoints to Edge Function for Accurate Fuel Stop Corridor Filtering

### Problem

The `landstar-fuel-stops` edge function only receives origin and destination coordinates. It filters fuel stops by checking their distance from a **single straight line** between origin and destination. For a multi-stop route (TX to OH with 7 stops across Ohio), many fuel stops near the intermediate stops are outside this corridor and get filtered out -- showing stops along the old direct route instead of the actual driving path.

### Solution

1. Send geocoded waypoint coordinates from the frontend to the edge function
2. Update the edge function's corridor filtering to check distance from **all route segments** (origin-to-wp1, wp1-to-wp2, ..., wpN-to-destination), using the minimum distance

---

### Change 1: Frontend -- Send Waypoints to Edge Function

**File: `src/components/driver/TripFuelPlanner.tsx`**

- The query currently fires when `originCoords` and `destCoords` are set, but waypoints may not yet be geocoded
- Update `enabled` condition: also require that geocoding is complete (i.e., `geocoding === false`)
- Include the geocoded waypoint coordinates in the request body as an array of `{lat, lng}` objects
- Update the query key to include the waypoint count so the query re-runs when waypoints become available

```
body: {
  driver_id: driverId,
  origin_lat: originCoords.lat,
  origin_lng: originCoords.lng,
  dest_lat: destCoords.lat,
  dest_lng: destCoords.lng,
  waypoints: geocodedStops.map(s => ({ lat: s.coords.lat, lng: s.coords.lng })),
  corridor_miles: 50,
  force_refresh: shouldForce,
}
```

### Change 2: Edge Function -- Multi-Segment Corridor Filtering

**File: `supabase/functions/landstar-fuel-stops/index.ts`**

- Accept a new optional `waypoints` array in the request body: `Array<{lat: number, lng: number}>`
- Create a new function `distanceToMultiSegmentRoute(pointLat, pointLng, segments)` that:
  - Builds route segments from: origin -> wp1 -> wp2 -> ... -> destination
  - Calculates distance from the point to each segment using the existing `distanceToRouteSegment`
  - Returns the **minimum** distance across all segments
- Use this new function in both:
  - The cache retrieval filtering (line 318)
  - The fresh data filtering (line 443)
- Update the cache bounding box to encompass all waypoints, not just origin/destination

The segments array will look like:
```
[origin, wp1], [wp1, wp2], ..., [wpN, destination]
```

If no waypoints are provided, behavior is identical to current (single segment origin-to-destination).

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/driver/TripFuelPlanner.tsx` | Send waypoints array in the edge function request; wait for geocoding before fetching; update query key |
| `supabase/functions/landstar-fuel-stops/index.ts` | Accept waypoints; build multi-segment route; filter corridor against all segments |

---

### Technical Details

**Multi-segment distance calculation:**

For a route with waypoints [wp1, wp2, wp3], the segments are:
```
Segment 1: origin -> wp1
Segment 2: wp1 -> wp2
Segment 3: wp2 -> wp3
Segment 4: wp3 -> destination
```

For each fuel stop, compute `distanceToRouteSegment` for all 4 segments and take the minimum. A stop within 50 miles of ANY segment is included.

**Cache bounding box update:**

The current cache query uses a bounding box based on origin/destination. With waypoints, the bounding box must cover all points:
```
minLat = min(origin_lat, dest_lat, ...waypoint_lats) - margin
maxLat = max(origin_lat, dest_lat, ...waypoint_lats) + margin
```

This ensures cached stops near intermediate waypoints are included.

**Query key update:**

The current key is `['fuel-stops', driverId, originCoords?.lat, destCoords?.lat]`. Updated to include waypoint count: `['fuel-stops', driverId, originCoords?.lat, destCoords?.lat, geocodedStops.length]` so the query re-fetches when waypoints are resolved.

