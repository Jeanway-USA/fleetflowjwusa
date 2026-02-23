

## Official Truck Stop Database -- Cache-on-Demand Architecture

### Overview

Replace the Overpass (OpenStreetMap) data source with a curated database of official truck stop locations from major brands (Pilot/Flying J, Love's, TA/Petro). A new admin-triggered sync edge function fetches data from public store locator endpoints and UPSERTs into a dedicated table. The existing `landstar-fuel-stops` function is updated to query this official data instead of Overpass.

No external API keys are required -- the sync function uses publicly accessible store locator endpoints from the truck stop brands themselves.

### 1. Database Migration

Create `official_truck_stops` table (no PostGIS needed -- uses existing bounding-box + haversine pattern):

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| brand | text | NOT NULL (Pilot, Love's, TA, etc.) |
| store_number | text | NOT NULL |
| name | text | NOT NULL |
| address | text | |
| city | text | |
| state | text | NOT NULL |
| latitude | numeric | NOT NULL |
| longitude | numeric | NOT NULL |
| amenities | text[] | default '{}' |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Constraints:
- UNIQUE on (brand, store_number)
- RLS enabled, read access for authenticated users, write via service role only

### 2. New Edge Function: `sync-official-truck-stops`

A super-admin-only function that fetches store directories from public brand endpoints:

**Brand endpoints attempted (in order):**
- Pilot/Flying J: `https://www.pilotflyingj.com/api/en/location-results` (public store locator JSON)
- Love's: `https://www.loves.com/api/sitecore/StoreSearch/SearchStores` (public search API)
- TA/Petro: `https://www.ta-petro.com/api/location-search` (public locator)

**For each brand:**
1. Fetch JSON from the public endpoint
2. Parse store_number, name, address, city, state, lat, lng
3. UPSERT into `official_truck_stops` on (brand, store_number) conflict
4. Return count of synced stops per brand

**Error handling:**
- Each brand fetch is independent -- if one fails, others still sync
- 10s timeout per request
- Returns a summary: `{ pilot: 450, loves: 380, ta: 290, errors: ['TA endpoint returned 403'] }`

**Auth:** Requires super admin (validated via `is_super_admin()` RPC)

### 3. Admin UI: InfrastructureTab

Add a "Database Management" card below the existing "Storage Usage" card with:
- "Sync Official Truck Stop Data" button
- Shows last sync timestamp and stop counts per brand
- Loading spinner during sync
- Toast notification on success/failure

### 4. Update `landstar-fuel-stops` Edge Function

**Changes to existing function:**
- Remove all Overpass code (~130 lines): `fetchOverpassStops`, `chunkRouteToBBoxes`, `BBox` interface, `OverpassStop` interface, `upsertStops`
- Replace `queryLocalStops` to query `official_truck_stops` instead of `truck_stops`
- Keep all existing logic: CORS, auth, EIA pricing, LCAPP matching, IFTA credits, Landstar scrape, interpolated fallback, caching

**Modified flow:**
1. Check `fuel_stops_cache` (6h TTL) -- unchanged
2. Query `official_truck_stops` within bounding box (replaces `truck_stops` query)
3. No more Overpass fetch step -- data is pre-populated by admin sync
4. Enrich with EIA prices, LCAPP discounts, IFTA credits -- unchanged
5. Filter within corridor, sort by distance -- unchanged
6. Interpolated fallback if sparse -- unchanged
7. Cache results -- unchanged

### 5. Frontend: TripFuelPlanner.tsx

**Updates to stop display:**
- Show brand + store number: "Love's Travel Stop - Store #452"
- Show full address line below the name
- Update source badge: show brand icon/badge when source is 'official'
- Add `address` and `store_number` to the `FuelStop` interface

### File Changes Summary

| File | Action |
|------|--------|
| SQL migration | Create `official_truck_stops` table |
| `supabase/functions/sync-official-truck-stops/index.ts` | New edge function |
| `supabase/config.toml` | Add `[functions.sync-official-truck-stops]` entry |
| `supabase/functions/landstar-fuel-stops/index.ts` | Remove Overpass, query `official_truck_stops` |
| `src/components/superadmin/InfrastructureTab.tsx` | Add sync button card |
| `src/components/driver/TripFuelPlanner.tsx` | Update stop display with brand/store# |

### Technical Notes

- No PostGIS extension needed -- uses the same bounding-box lat/lng filtering already in place
- No external API keys required -- brand store locators are public endpoints
- The sync function is designed to be run periodically (truck stops rarely move) -- once per month is sufficient
- If a brand endpoint changes or blocks requests, the function gracefully skips that brand and reports the error
- Existing `truck_stops` and `fuel_stops_cache` tables remain untouched for backward compatibility

