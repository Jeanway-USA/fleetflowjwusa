

## Rewrite: Corporate API Data Aggregation for Truck Stop Sync

### Overview

Replace the Overpass/OpenStreetMap approach with direct fetches from the public locator infrastructure of each major brand. Since all three corporate REST APIs (Love's, Pilot/Flying J, TA/Petro) require OAuth or Bearer tokens from their developer portals, we will use their **public-facing locator data sources** that power their websites -- these return structured JSON or HTML without authentication.

### Architecture

The edge function becomes a single-call endpoint (no more bbox/region chunking). The frontend simplifies to a single button with a loading spinner.

---

### 1. Edge Function Rewrite (`supabase/functions/sync-official-truck-stops/index.ts`)

**Remove entirely:**
- Overpass API URL and query building
- BRAND_REGEX, classifyBrand, deduplicateStops helpers
- bbox parameter parsing
- Retry logic for Overpass

**Replace with three brand-specific fetcher functions:**

#### `fetchLovesLocations()`
- **Source**: `https://www.loves.com/api/sitecore/StoreLocator/GetNearbyStores` (the XHR endpoint their locator page calls)
- Query with a large radius from center-US coordinates to get all stores
- Falls back to paginated calls if needed (multiple center points across US)
- Maps response to: `{ brand: "Love's", store_number, name, address, city, state, latitude, longitude }`

#### `fetchPilotFlyingJLocations()`
- **Source**: `https://locations.pilotflyingj.com/index.html` -- their Yext-powered locator serves location data
- Use the Yext search API that powers their locator: query all US states to get complete coverage
- Falls back to fetching the state-level directory pages (`/us/al`, `/us/ak`, etc.) and parsing location data from embedded JSON-LD
- Maps response to: `{ brand: "Pilot" | "Flying J", store_number, name, address, city, state, latitude, longitude }`

#### `fetchTAPetroLocations()`
- **Source**: Parse the `https://www.ta-petro.com/location/all-locations/` page which contains a complete directory of every TA, Petro, and TA Express location with store numbers
- For each location, extract brand (TA/Petro/TA Express) and store number from the link text (e.g., "TA Commerce City #0148")
- Extract state from the accordion headers and city from the location name
- For geocoding, use a secondary fetch to each individual location page to extract lat/lng from embedded map data, OR use a batch approach with the location's address
- Maps response to: `{ brand: "TA" | "Petro" | "TA Express", store_number, name, address, city, state, latitude, longitude }`

**Important consideration**: Since scraping individual pages for 250+ TA/Petro locations would be too slow for a single edge function invocation (300s timeout), the TA/Petro fetcher will use a pragmatic approach:
- Parse the all-locations directory page for name, brand, store number, state, and city
- Use the Nominatim geocoding API (or a simple city/state geocoder) to batch-resolve coordinates
- Alternatively, store the locations without coordinates initially and backfill later

#### Main Handler
```
Promise.allSettled([
  fetchLovesLocations(),
  fetchPilotFlyingJLocations(),
  fetchTAPetroLocations(),
])
```
- Merge all successful arrays
- Filter out entries missing latitude or longitude
- Batch upsert into `official_truck_stops` on conflict `(brand, store_number)`
- Return summary: `{ loves: N, pilot_flyingj: N, ta_petro: N, total_upserted: N }`

#### Auth & CORS
- Keep existing super_admin JWT validation (unchanged)
- Keep existing CORS headers (unchanged)
- Remove bbox body parameter requirement

---

### 2. Frontend Simplification

#### Remove: `SyncMapModal.tsx`
The entire file is deleted. No more map, no more region grid, no more sequential chunking.

#### Update: `InfrastructureTab.tsx`
- Remove the `SyncMapModal` import and state
- Replace the "Sync Official Truck Stop Data" button with inline sync logic:
  - On click: set loading state, call `supabase.functions.invoke('sync-official-truck-stops')` (no body needed)
  - On success: show toast "Successfully synced X official locations from corporate servers"
  - On error: show error toast
  - Show a spinner on the button while syncing

---

### 3. Realistic Data Strategy

Since all three corporate APIs require authentication, and scraping hundreds of individual pages isn't viable within edge function timeouts, the implementation will use a **tiered approach**:

1. **Love's** -- Their locator page makes XHR calls to an internal API. We'll reverse-engineer this endpoint to fetch all ~600 Love's locations in one call.

2. **Pilot/Flying J** -- Their Yext-powered locator at `locations.pilotflyingj.com` uses a known API pattern. We'll query the Yext API with broad US searches to pull ~800 locations.

3. **TA/Petro** -- Parse the static HTML directory at `ta-petro.com/location/all-locations/` to extract ~280 locations with store numbers. For coordinates, we'll use Nominatim free geocoding (1 req/sec rate limit, batched).

If any fetcher fails, the others still succeed (Promise.allSettled). The function logs detailed results for each brand.

---

### Files Changed

| File | Action |
|------|--------|
| `supabase/functions/sync-official-truck-stops/index.ts` | Full rewrite -- corporate API fetchers |
| `src/components/superadmin/InfrastructureTab.tsx` | Edit -- inline sync button, remove SyncMapModal |
| `src/components/superadmin/SyncMapModal.tsx` | Delete |

---

### Risks and Mitigations

- **Corporate endpoints may change** -- Each fetcher has try/catch and the function uses Promise.allSettled, so one brand failing won't break the others
- **Rate limiting by corporate servers** -- Add respectful delays and User-Agent headers
- **Edge function timeout (300s)** -- The TA/Petro HTML parsing + geocoding is the bottleneck; we'll batch geocoding requests efficiently
- **Geocoding accuracy** -- Nominatim is free but may not perfectly resolve all addresses; locations without coordinates are filtered out before upsert

