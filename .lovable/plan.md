

## Fix: Sparse Fuel Stop Density on Long Routes (PA to TN)

### Root Cause Analysis

Three compounding issues cause only 1 stop to appear on a 600-mile PA-to-TN route:

**Issue 1: Interpolated fallback is too sparse and skips endpoints.**
`generateInterpolatedStops()` (line 333) samples every 75 miles, then **skips** the first and last sampled points (line 343: `if (i === 0 || i === sampled.length - 1) continue`). For a 500-mile route, that produces ~5 sample points, minus 2 skipped = only 3 stops. Sometimes fewer if distances don't align evenly.

**Issue 2: Fallback only triggers when ZERO real stops are found.**
Line 775: `if (filteredStops.length === 0 && route_polyline...)`. If even 1 real stop passes the corridor filter, the interpolated fallback never fires. The driver sees just that 1 stop for 600 miles.

**Issue 3: No KNOWN_STOPS along the PA-to-TN corridor.**
The I-81/I-77/I-40 corridor (Harrisburg PA -> Knoxville TN) has zero entries in `KNOWN_STOPS`. Pittsburgh and Nashville exist but are off this route. So the corridor filter correctly finds 0-1 real stops.

---

### Fix 1: Backend -- Always Supplement Sparse Results with Interpolated Stops

Change the fallback threshold from `=== 0` to a density check. A 600-mile trip should have at least 1 stop per 100 miles. If the filtered real stops are below that density, generate interpolated stops to fill the gaps.

```
const minExpectedStops = Math.max(3, Math.floor(tripMiles / 100));
if (filteredStops.length < minExpectedStops && route_polyline && route_polyline.length >= 2) {
  // Generate interpolated stops, then merge + deduplicate with real stops
}
```

### Fix 2: Backend -- Increase Interpolation Density

- Change `generateInterpolatedStops` interval from 75 miles to 50 miles
- Remove the `if (i === 0 || i === sampled.length - 1) continue` skip -- instead, skip only points within 20 miles of origin/destination to avoid cluttering the endpoints
- This ensures a 600-mile route generates ~10-12 interpolated stops instead of 1-3

### Fix 3: Backend -- Merge and Deduplicate Real + Interpolated Stops

When supplementing with interpolated stops:
1. Generate the full set of interpolated stops
2. For each interpolated stop, check if a real stop already exists within 15 miles
3. If so, skip the interpolated one (prefer the real LCAPP partner stop)
4. Merge both sets, sort by distance from origin
5. Log `total_waypoints_sampled` and `total_deduplicated_stops_found`

### Fix 4: Backend -- Add KNOWN_STOPS for I-81/I-77/I-40 Corridor

Add ~10 stops along the PA-to-TN route:
- Harrisburg PA, Carlisle PA, Hagerstown MD, Winchester VA, Staunton VA, Wytheville VA, Bristol VA/TN, Knoxville TN, Cookeville TN, Crossville TN

This ensures real LCAPP partner stops appear for this high-traffic corridor.

### Fix 5: Frontend -- Increase Corridor to 35mi

Change `corridor_miles: 25` to `corridor_miles: 35`. For a dataset of ~70 known stops, 25mi is still too narrow. 35mi catches stops that are 1-2 highway exits off the route while remaining precise with polyline filtering.

### Fix 6: Frontend -- Enhanced Payload Logging

Add the total route distance and point count to the existing console.log to verify polyline quality.

---

### File Changes

| File | Changes |
|------|--------|
| `supabase/functions/landstar-fuel-stops/index.ts` | Add ~10 I-81/I-40 corridor stops to KNOWN_STOPS; change interpolation interval from 75mi to 50mi; remove endpoint-skip logic; change fallback threshold from `=== 0` to density-based; merge/deduplicate real + interpolated stops; add `total_waypoints_sampled` and `total_deduplicated_stops_found` logs |
| `src/components/driver/TripFuelPlanner.tsx` | Change `corridor_miles` from 25 to 35; add route distance to console.log |

---

### Technical Detail: Density-Based Fallback

```text
BEFORE:
  PA -> TN (600mi): KNOWN_STOPS filter = 1 stop
  filteredStops.length === 0? NO (it's 1)
  Interpolated fallback skipped
  Result: 1 stop for 600 miles

AFTER:
  PA -> TN (600mi): KNOWN_STOPS filter = 1 stop
  minExpectedStops = max(3, floor(600/100)) = 6
  filteredStops.length (1) < 6? YES
  Generate interpolated stops every 50mi = ~12 points
  Remove interpolated stops within 15mi of the 1 real stop
  Merge: 1 real + 11 interpolated = 12 stops
  Result: 12 stops along the full corridor
```
