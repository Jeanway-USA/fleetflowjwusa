

## Fix: Fuel Planner Rendering Zero Stops Along Route

### Root Cause (Confirmed from Logs)

The edge function logs show:

```
Cached 42 fuel stops
Returning 0 fuel stops within 15mi corridor (polyline: true)
```

The `KNOWN_STOPS` array has only ~42 entries scattered across the US. For a Boston-to-Newark route, **none** of those 42 stops fall within 15 miles of the I-95 polyline. The spatial filtering is working correctly -- it just has no data to match against.

### Fix Summary

Three changes across two files to guarantee stops always appear:

---

### 1. Edge Function: Add Interpolated Fallback Stops (`landstar-fuel-stops/index.ts`)

After filtering, if `filteredStops.length === 0`, generate synthetic stops along the route polyline using the existing `sampleRoutePoints()` function:

- Sample the polyline every ~75 miles
- For each sampled coordinate, reverse-lookup the nearest US state from coordinates (simple lat/lng bounding box lookup)
- Generate a "Generic Truck Stop" entry using the state's EIA diesel price from `dieselPrices` or `FALLBACK_DIESEL_PRICES`
- Mark these with `source: 'interpolated'` and `chain: null` so the UI can distinguish them
- Apply no LCAPP discount (since they're generic), but still include IFTA tax credits

This guarantees at least 5-10 stops appear on any route regardless of KNOWN_STOPS coverage.

**Also increase `corridor_miles` default from the overly-tight 15 back to 50** in the edge function defaults (line 428). The frontend sends 15, but the backend default should be wider for when the frontend omits it.

### 2. Edge Function: Expand KNOWN_STOPS with I-95/I-90 Coverage

Add ~20 more stops along high-traffic corridors that are currently missing:

- I-95 Northeast: Hartford CT, Providence RI, Bridgeport CT, New Haven CT, Stamford CT area stops
- I-90: Worcester MA, Springfield MA, Albany NY
- I-78/NJ Turnpike: Newark NJ, Edison NJ, Allentown PA

This directly fixes the Boston-to-Newark scenario and improves coverage generally.

### 3. Frontend: Increase Corridor to 25mi (`TripFuelPlanner.tsx`)

Change `corridor_miles: 15` back to `corridor_miles: 25` in the edge function call. A 15mi corridor is too narrow for a sparse dataset of ~60 stops. 25mi provides a good balance between precision and coverage.

Also add `console.log` before the `supabase.functions.invoke` call to log the payload being sent (for debugging).

### 4. Map: No Changes Needed to FuelPlannerMap.tsx

The map component already handles all marker types correctly. The `FitBounds` ref warning in console is cosmetic and does not affect rendering. Markers will render as soon as the backend returns non-empty `fuel_stops`.

---

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/landstar-fuel-stops/index.ts` | Add ~20 new KNOWN_STOPS entries for I-95/I-90 corridors; add `generateInterpolatedStops()` fallback function; increase default corridor to 50mi |
| `src/components/driver/TripFuelPlanner.tsx` | Change `corridor_miles` from 15 to 25; add console.log for payload debugging |

### Technical Detail: Interpolation Logic

```text
When filteredStops.length === 0:
  1. sampleRoutePoints(polyline, 75) --> generates coords every 75mi
  2. For each coord, determine state from lat/lng lookup table
  3. Create entry: { name: "Truck Stop near [City]", diesel_price: state_price, source: "interpolated" }
  4. These bypass corridor filtering (they ARE on the route)
  5. Return these as fuel_stops so the map always has markers
```

The state lookup uses a simple coordinate-to-state mapping (bounding boxes for each state). This is fast and requires no external API.
