

## Restore Dual-Mode Fuel Trip Planner and Remove Truck Stop Scraper

### Overview

Remove the failed `official_truck_stops` database/scraper infrastructure entirely and rewrite the `landstar-fuel-stops` edge function to work in two modes: real Landstar LCAPP data (when credentials exist) or deterministic fallback stops generated along the route polyline. Both modes produce stops plotted directly on the route.

---

### Changes

#### 1. Delete `sync-official-truck-stops` Edge Function
- Delete the entire `supabase/functions/sync-official-truck-stops/` directory
- Remove the `[functions.sync-official-truck-stops]` entry from `supabase/config.toml`

#### 2. Clean Up `InfrastructureTab.tsx`
- Remove the entire "Database Management" card (lines 126-190) which contains the Sync button, truck stop stats, and brand counts
- Remove unused imports: `Database`, `RefreshCw`, `Fuel`, `Loader2`, `Badge`, `Button`
- Remove the `syncing` state, `handleSync` function, and `truckStopStats` query
- Keep the Storage Usage card intact

#### 3. Database Migration
- `DROP TABLE IF EXISTS public.official_truck_stops CASCADE;` -- remove the table entirely
- `DROP FUNCTION IF EXISTS public.truck_stop_brand_counts();` -- remove the RPC

#### 4. Rewrite `landstar-fuel-stops/index.ts` (Core Change)

Remove all references to `official_truck_stops` and the `queryOfficialStops` function. The new architecture:

**Keep unchanged:**
- CORS headers, auth validation
- `STATE_DIESEL_TAX` rates, `FALLBACK_DIESEL_PRICES`, `NATIONAL_AVG_DIESEL`
- `LCAPP_PARTNERS` directory and `matchLCAPP` function
- `STATE_BOUNDS` and `lookupStateFromCoords` for geometric state lookup
- All distance/haversine utility functions including `distanceToPolyline`, `sampleRoutePoints`
- AES-GCM decryption for Landstar credentials
- `attemptLandstarScrape` function
- EIA diesel price fetcher
- `computeProjectedSavings`
- Cache logic (`fuel_stops_cache`)

**Remove:**
- `queryOfficialStops` function (lines 229-257)
- All STEP 2 references to `official_truck_stops`

**Add/modify the main handler flow:**

1. **Parse request** (unchanged)
2. **Check cache** (unchanged -- 6h TTL)
3. **Check Landstar credentials** -- query `driver_settings` for `landstar_username`/`landstar_password`
4. **Fetch EIA diesel prices** (unchanged)
5. **Mode A (Landstar Auth):**
   - If credentials exist, attempt `attemptLandstarScrape()`
   - If Landstar returns data, sample the route polyline every 50 miles, match each Landstar stop within 20mi of any sample point
   - Enrich matched stops with IFTA tax credits via `lookupStateFromCoords`
   - Set `source: 'landstar'`
6. **Mode B (Fallback -- no auth or Landstar failed):**
   - Sample route polyline every ~75 miles using `sampleRoutePoints()`
   - At each sample point, generate a deterministic fallback stop:
     - Name: `"Travel Center - Mile {X}"` or generic chain name from `LCAPP_PARTNERS` keys (rotate through them)
     - State: determined by `lookupStateFromCoords(lat, lng)`
     - Diesel price: from EIA state prices
     - Generic estimated discount: $0.40/gal savings (labeled as "Estimated Generic Discount")
     - IFTA tax credit: from `STATE_DIESEL_TAX[state]`
   - Skip points within 20mi of origin/destination
   - Set `source: 'estimated'`
7. **Both modes:** Sort by `distance_from_origin`, compute `projected_savings`, cache results
8. **Response payload** includes a new field `stop_type` per stop: `'landstar'` or `'estimated'`

#### 5. Frontend Updates (`TripFuelPlanner.tsx`)

**FuelStop interface update:**
- Add `stop_type?: 'landstar' | 'estimated'` field

**Source badge (line 305-309):**
- If `source === 'landstar'`: Show "LCAPP Live" badge (green, existing)
- If `source === 'estimated'`: Show "Estimated Prices" badge (amber)

**Legend update (lines 330-347):**
- "LCAPP Partner" stays green
- Rename "Other Stop" to "Estimated Stop" when source is estimated

**Stop list cards (lines 438-486):**
- Show stop type label per card:
  - Landstar stops: display "Landstar Network Price" in primary color
  - Estimated stops: display "Est. Generic Price" in amber
- LCAPP discount line: show "LCAPP Discount" for Landstar, "Est. Savings" for estimated
- IFTA tax credit line: already displayed correctly (lines 478-482), keep as-is
- State name shown alongside IFTA credit: add `({stop.state})` after the IFTA amount

**Projected Savings card (lines 351-367):**
- No structural change needed -- already shows cheapest net price vs national average
- Add a subtle note if source is estimated: "Based on estimated regional pricing"

**Cost estimate section (lines 369-411):**
- Rename "LCAPP savings" label to be dynamic:
  - If source is `landstar`: "LCAPP savings"
  - If source is `estimated`: "Est. discount savings"

---

### Files Changed

| File | Action |
|------|--------|
| `supabase/functions/sync-official-truck-stops/` | Delete entirely |
| `supabase/functions/landstar-fuel-stops/index.ts` | Rewrite -- remove official_truck_stops dependency, add dual-mode logic |
| `src/components/superadmin/InfrastructureTab.tsx` | Edit -- remove Database Management card |
| `src/components/driver/TripFuelPlanner.tsx` | Edit -- add stop_type handling, dynamic labels |
| Database migration | DROP TABLE official_truck_stops, DROP FUNCTION truck_stop_brand_counts |

