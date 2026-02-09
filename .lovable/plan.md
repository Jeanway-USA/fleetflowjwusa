

# IFTA Enhancements: Jurisdiction Editing + Route-Based State Detection

## Overview

Two improvements to make IFTA reporting more accurate:

1. **Manual Jurisdiction Editing** -- Allow users to set or correct the state on fuel expenses that couldn't be auto-detected during sync, directly from the IFTA Fuel Purchases tab.
2. **Route-Based Multi-State Mileage Splitting** -- When auto-generating IFTA records from loads, use OSRM routing data to determine which states the route actually passes through and allocate miles proportionally, instead of the current 50/50 origin-destination split.

---

## Feature 1: Edit Jurisdiction on Unsynced Expenses

### Problem
After running "Sync from Expenses," some fuel expenses get skipped because no state could be determined (vendor string has no state, and the expense isn't linked to a load). Currently, these sit in the expenses table with no way to fix them from the IFTA page.

There are currently 3 such expenses (PILOT #436, LOVES #609, FLYING J #237241) -- no jurisdiction, no load_id.

### Solution
Add an "Unsynced Expenses" section at the bottom of the Fuel Purchases tab that:
- Shows fuel/DEF expenses from the selected quarter that have no matching `fuel_purchases` record
- Displays a compact inline state dropdown on each row so the user can assign a jurisdiction
- On state selection, updates the expense's `jurisdiction` field, which triggers the existing database function (`sync_fuel_expense_to_ifta`) to automatically create the fuel purchase record
- Once synced, the expense moves from the "unsynced" list to the main fuel purchases table

### UI Design
A secondary card titled "Expenses Missing Jurisdiction" appears below the main Fuel Purchases table when there are unsynced items. Each row shows:
- Date, Type, Vendor, Amount, Gallons
- An inline state `Select` dropdown to assign jurisdiction
- A small "Save" button to confirm

### Changes to `src/pages/IFTA.tsx`
- Add a new query to fetch fuel/DEF expenses without matching fuel_purchases for the selected quarter
- Add a mutation to update the jurisdiction on an expense
- Render the "Expenses Missing Jurisdiction" card with inline dropdowns

---

## Feature 2: Route-Based Multi-State Mileage Splitting

### Problem
The current IFTA auto-generation splits miles 50/50 between origin and destination states. For a load from Mississippi to Texas, this means MS and TX each get half the miles -- but the route actually passes through Alabama, Mississippi, Louisiana, and Texas. This significantly misallocates IFTA tax liability.

### Solution
Use the existing OSRM routing infrastructure to fetch the actual route geometry for each load, then sample points along the route to determine which states are traversed and how many miles occur in each state.

### How It Works

1. **Geocode origin/destination** -- Use `geocodeLocationAsync()` from the existing geocoding utility
2. **Parse intermediate stops** -- Use `parseIntermediateStops()` to get waypoints from load notes
3. **Fetch OSRM route** -- Use `fetchRouteWithWaypoints()` to get the full route polyline with per-leg distances
4. **State detection via reverse geocoding** -- Sample points along the route at regular intervals (every ~50 miles) and use Nominatim's reverse geocoding to determine which US state each point falls in
5. **Proportional allocation** -- Calculate what fraction of the route falls in each state and multiply by total load miles

### Implementation: New Utility

Create `src/lib/ifta-route-analysis.ts` with:
- `analyzeRouteStates(routeCoords, totalMiles)` -- Samples route points at intervals, reverse-geocodes them to get states, and returns a `Record<string, number>` mapping state codes to miles
- Uses a simple point-in-state approach: samples the route polyline at distance intervals and reverse-geocodes using Nominatim
- Includes caching of reverse geocode results to avoid redundant API calls
- Falls back to the existing 50/50 split if route analysis fails

### Changes to `src/pages/IFTA.tsx`

Update the `autoGenerateIFTA` function:
- For each delivered load, geocode origin + destination, parse intermediate stops, and fetch the OSRM route
- Pass the route geometry to the new analysis function to get per-state mile breakdown
- Aggregate the state-level miles across all loads
- Show a progress indicator since route analysis takes longer than the instant 50/50 split
- Add rate-limiting delays between loads to respect OSRM and Nominatim rate limits
- Fall back to the current 50/50 split for any load where route analysis fails

### Performance Considerations
- Route data is cached in-memory by the existing `fetchRoute`/`fetchRouteWithWaypoints` functions
- Reverse geocode results are cached to avoid repeated lookups for nearby points
- Sequential processing with delays respects public API rate limits
- A progress toast shows "Analyzing routes: 3/12 loads..."
- For a typical quarter with ~20 loads, the process should take about 30-60 seconds

---

## Technical Details

### Files to Create
- `src/lib/ifta-route-analysis.ts` -- Route sampling and state detection utility

### Files to Modify
- `src/pages/IFTA.tsx` -- Add unsynced expenses section + integrate route-based mileage analysis

### Dependencies
No new dependencies needed. Uses existing:
- `geocodeLocationAsync` from `src/lib/geocoding.ts`
- `fetchRouteWithWaypoints` from `src/lib/routing.ts`
- `parseIntermediateStops` from `src/lib/parseIntermediateStops.ts`
- Nominatim reverse geocoding API (same service already used for forward geocoding)

### Data Flow: Route-Based State Detection

```text
For each delivered load:
  1. Geocode origin + destination addresses
  2. Parse intermediate stops from notes
  3. Geocode intermediate stop addresses
  4. Fetch OSRM route (origin -> waypoints -> destination)
  5. Calculate total route distance from geometry
  6. Sample points along route every ~50 miles
  7. Reverse-geocode each sample point -> get state
  8. Calculate distance between consecutive samples
  9. Attribute each segment's distance to its state
  10. Return { TX: 312, LA: 178, MS: 95, ... }
```

### Fallback Strategy
If any step fails for a load (geocoding failure, OSRM timeout, etc.), that load falls back to the existing 50/50 origin/destination split. This ensures the feature degrades gracefully without blocking the entire IFTA generation.

