

## Fix: Fuel Stops Sort Order and Data Accuracy

### Root Cause

**Bug 1 -- Reverse/Wrong Order:** The edge function sorts stops by `net_price` (cheapest first) on both the cache path (line 770) and the fresh-fetch path (line 916). The frontend renders `fuelStops.map()` in array order, so stops appear price-sorted rather than geographically sequential along the route. The density-based fallback path (line 941) correctly sorts by `distance_from_origin`, but the primary paths do not.

**Bug 2 -- Store Data:** The `KNOWN_STOPS` entries use invented store numbers (e.g., "#356", "#308") which look like real Landstar IDs but are not. The interpolated stops use `Math.round(distToOrigin)` for mile-marker names, which is correct behavior. No `Math.random()` is used for coordinates -- all lat/lng values are real city-center coordinates. The only fix needed is making store naming clearer for interpolated vs. real LCAPP stops.

### Changes

#### 1. Edge Function (`landstar-fuel-stops/index.ts`)

**Sort all output by `distance_from_origin` instead of `net_price`:**

- **Line 770 (cache path):** Change `.sort((a, b) => (a.net_price || 999) - (b.net_price || 999))` to `.sort((a, b) => (a.distance_from_origin || 0) - (b.distance_from_origin || 0))`
- **Line 916 (fresh-fetch path):** Same change -- sort by `distance_from_origin` ascending

This ensures stops are always returned origin-to-destination regardless of which code path executes.

#### 2. Frontend (`TripFuelPlanner.tsx`)

**Fix "cheapest" calculation (line 201):** Currently `const cheapest = fuelStops[0]` assumes price-sorted order. After the backend fix, index 0 will be the stop nearest the origin, not the cheapest. Change the cost estimate logic to find the actual cheapest stop using `reduce()` or `Math.min()` instead of relying on array position.

**No `.reverse()` exists** -- confirmed the frontend renders in backend order, so no additional fix needed for list rendering.

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/landstar-fuel-stops/index.ts` | Change sort on lines 770 and 916 from `net_price` to `distance_from_origin`; edge function redeploy |
| `src/components/driver/TripFuelPlanner.tsx` | Fix `costEstimate` to find cheapest by price via `reduce()` instead of `fuelStops[0]` |

### Technical Detail

```text
BEFORE (cache path, line 770):
  .sort((a, b) => (a.net_price || 999) - (b.net_price || 999))
  --> Stop list: cheapest first (geographic order random)

AFTER:
  .sort((a, b) => (a.distance_from_origin || 0) - (b.distance_from_origin || 0))
  --> Stop list: origin first, destination last (sequential along route)

Frontend costEstimate fix:
  BEFORE: const cheapest = fuelStops[0]  // assumed price-sorted
  AFTER:  const cheapest = fuelStops.reduce((min, s) =>
            (s.net_price || s.diesel_price || 999) < (min.net_price || min.diesel_price || 999) ? s : min
          , fuelStops[0])
```

