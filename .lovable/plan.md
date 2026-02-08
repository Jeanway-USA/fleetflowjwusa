

## Plan: Fix Fuel Trip Planner Refresh + Add IFTA Tax Credit to Discount

### Problem 1: Refresh Button Not Working

The refresh button calls `refetch()` on the React Query, which re-calls the `landstar-fuel-stops` edge function. However, the edge function has a **6-hour server-side cache** (`fuel_stops_cache` table). Unless `force_refresh: true` is passed, the edge function returns the same cached data. The frontend never sends `force_refresh`, so the button does nothing useful.

**Fix:**

In `TripFuelPlanner.tsx`:
- Update `handleRefresh` to pass `force_refresh: true` to the edge function
- Since React Query's `refetch()` re-runs the same `queryFn`, we need to use a different approach: add a `refreshToken` state that increments on each refresh click, include it in the query key so the query re-runs, and pass `force_refresh: true` in the request body when `refreshToken > 0`
- Alternative simpler approach: invalidate the query cache and include `force_refresh` as a ref/state that the query function reads

The simplest approach:
1. Add a `forceRefresh` ref that starts as `false`
2. In `handleRefresh`, set `forceRefresh.current = true`, then call `refetch()`
3. In the `queryFn`, read `forceRefresh.current` and pass it to the edge function body
4. After the query completes, reset `forceRefresh.current = false`

---

### Problem 2: IFTA Tax Credit Not Shown

When a driver buys fuel in a state, they pay state diesel excise tax embedded in the pump price. Through IFTA quarterly filing, they receive tax credits for fuel purchased. This effectively reduces the real cost of fuel, but the Fuel Trip Planner currently only shows the LCAPP discount.

**Fix:**

Add a static lookup of state IFTA diesel fuel tax rates (cents per gallon) and display the tax credit alongside the LCAPP discount in the savings section.

State IFTA diesel tax rates (per gallon, 2025/2026 approximate):

```text
TX: $0.20, OH: $0.385, AR: $0.285, MO: $0.195, IN: $0.56,
IL: $0.467, KY: $0.267, TN: $0.27, OK: $0.19, PA: $0.741, etc.
```

Changes needed:

**A. Edge function (`landstar-fuel-stops/index.ts`):**
- Add a `STATE_DIESEL_TAX` lookup table with per-state IFTA diesel excise tax rates
- Include `ifta_tax_credit` (the state's diesel tax per gallon) in each fuel stop's response data
- Update `net_price` calculation: `diesel_price - lcapp_discount - ifta_tax_credit`

**B. Frontend (`TripFuelPlanner.tsx`):**
- Display the IFTA tax credit per stop in popups and list items (e.g., "IFTA Credit: -$0.20/gal")
- Update the cost estimate calculation to include IFTA credits in total savings
- Show a separate "IFTA tax credit" line in the savings summary, or combine it with LCAPP into a total discount display
- The "LCAPP savings" line becomes "Total savings" or add a second line for "IFTA credit"

**C. Fuel stop list item display:**
- Each stop shows: Diesel price, LCAPP discount (if any), IFTA credit, and effective net price
- Example: "$3.25/gal - $0.10 LCAPP - $0.20 IFTA = $2.95 effective"

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/driver/TripFuelPlanner.tsx` | Fix refresh to pass `force_refresh: true`; display IFTA tax credit in UI |
| `supabase/functions/landstar-fuel-stops/index.ts` | Add state diesel tax lookup; include `ifta_tax_credit` in response; update `net_price` |

---

### Technical Details

**State IFTA Diesel Tax Rates (cents/gallon, approximate 2025-2026):**

These are the state excise taxes on diesel fuel that get credited through IFTA. They do NOT include federal excise tax ($0.244/gal) since that is not part of IFTA.

```
AL: 0.29, AK: 0.08, AZ: 0.26, AR: 0.285, CA: 0.4175,
CO: 0.205, CT: 0.4613, DE: 0.22, FL: 0.36, GA: 0.351,
HI: 0.16, ID: 0.32, IL: 0.467, IN: 0.56, IA: 0.325,
KS: 0.26, KY: 0.267, LA: 0.20, ME: 0.312, MD: 0.3675,
MA: 0.24, MI: 0.267, MN: 0.285, MS: 0.18, MO: 0.195,
MT: 0.2975, NE: 0.26, NV: 0.27, NH: 0.234, NJ: 0.485,
NM: 0.21, NY: 0.3055, NC: 0.382, ND: 0.23, OH: 0.385,
OK: 0.19, OR: 0.38, PA: 0.741, RI: 0.34, SC: 0.28,
SD: 0.28, TN: 0.27, TX: 0.20, UT: 0.32, VT: 0.31,
VA: 0.302, WA: 0.494, WV: 0.357, WI: 0.327, WY: 0.24
```

**Refresh flow:**

```text
1. User clicks refresh
2. forceRefresh ref set to true
3. refetch() called on React Query
4. queryFn runs, sends force_refresh: true to edge function
5. Edge function skips cache check, fetches fresh EIA prices
6. New fuel stops with updated prices returned
7. forceRefresh ref reset to false
8. UI updates with fresh data and new timestamp
```

**Updated savings display:**

The cost summary section will show:
- Best price (unchanged)
- Est. fuel cost (unchanged)  
- LCAPP savings (current calculation)
- IFTA credit (new line): estimated IFTA tax credit based on the weighted average state tax rate across the fuel stops on the route
- Or a combined "Total discount" line showing LCAPP + IFTA combined

