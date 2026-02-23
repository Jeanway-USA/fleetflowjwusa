

## Rewrite: Corporate-Only Truck Stop Sync (No More OSM/Overpass)

### Problem
The Overpass API returned irrelevant POIs (schools, parks, restaurants) due to broad regex matching. All OSM-sourced data is unreliable for a commercial TMS.

### Strategy
Abandon Overpass entirely. Fetch exclusively from corporate sources:

1. **Love's** -- Try the Sitecore locator endpoint (`GetNearbyStores`) that powers their website. If it returns data, great. If WAF-blocked, the fetcher returns empty gracefully.
2. **Pilot/Flying J** -- Scrape all 50 US state directory pages from `locations.pilotflyingj.com/us/{state_code}` which contain structured JSON-LD with lat/lng, store numbers, addresses, and brand classification (Pilot vs Flying J vs One9).
3. **TA/Petro** -- Keep the existing HTML directory parser at `ta-petro.com/location/all-locations/` with the static CITY_COORDS lookup for geocoding.

### Important Reality Check
All three brands' official REST APIs (Love's developer portal, TA developer portal) require OAuth/API key registration. The "corporate locator APIs" we're targeting are the **public-facing locator infrastructure** that powers their consumer websites -- not authenticated developer APIs. This is the best available option without API keys.

---

### Changes

#### 1. Edge Function Full Rewrite (`supabase/functions/sync-official-truck-stops/index.ts`)

**Remove entirely:**
- All Overpass API code (`OVERPASS_URL`, `fetchFromOverpass`, `classifyBrand`, retry logic)
- The `US_BBOX` constant

**Keep:**
- `BROWSER_HEADERS` (updated with Referer header per user request)
- `CITY_COORDS` static lookup
- `StopRecord` interface
- Auth check and CORS headers
- Batch upsert logic

**New fetchers:**

##### `fetchLoves()`
- POST to `https://www.loves.com/api/sitecore/StoreLocator/GetNearbyStores`
- Body: `latitude=39.8283&longitude=-98.5795&radius=5000&brandId=1` (center of US, huge radius)
- Headers: browser spoofing + `Referer: https://www.loves.com/en/location-and-fuel-price-search`
- Parse JSON response, map each location to `{ brand: "Love's", store_number, name, address, city, state, latitude, longitude }`
- Aggressive error logging on failure (log status + first 500 chars of body)

##### `fetchPilot()`
- Iterate over all 50 US state codes, fetch `https://locations.pilotflyingj.com/us/{state_code_lowercase}`
- Extract JSON-LD (`application/ld+json`) from each HTML page -- contains structured location data with lat/lng, address, store name
- Classify brand from name: "Flying J" / "Pilot" / "One9" / etc.
- Extract store number from name pattern (e.g., "Pilot Travel Center #180")
- Add 500ms delay between state fetches to be respectful
- Total: ~50 requests over ~25 seconds

##### `fetchTA()`
- Existing TA/Petro HTML directory parser (unchanged logic)
- Uses CITY_COORDS static lookup for geocoding
- Already handles TA, Petro, TA Express brands

**Main handler changes:**
- **TRUNCATE before upsert**: Delete all existing rows from `official_truck_stops` before inserting fresh data (user requested "start fresh")
- Execute all three fetchers with `Promise.allSettled()`
- Merge successful results, filter out entries with lat=0/lng=0
- Batch upsert with conflict on `(brand, store_number)`
- Return per-brand counts

#### 2. Database Cleanup
- Run a migration to TRUNCATE the `official_truck_stops` table to start fresh
- No schema changes needed -- table structure stays the same

#### 3. Frontend (`InfrastructureTab.tsx`)
- Already simplified from previous iteration -- no changes needed
- The single "Sync" button and RPC-based stats display remain as-is

---

### Technical Details

**Browser Spoofing Headers (all fetchers):**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36
Accept: application/json, text/plain, */*
Accept-Language: en-US,en;q=0.9
Referer: https://www.google.com/
```

**Error Logging Pattern (all fetchers):**
```
if (!res.ok) {
  const body = await res.text().catch(() => '[unreadable]');
  console.error(`[Brand] HTTP ${res.status} from ${url}`);
  console.error(`[Brand] Body (500 chars): ${body.substring(0, 500)}`);
}
```

**Pilot/FJ JSON-LD extraction:**
The state directory pages at `locations.pilotflyingj.com/us/{state}` embed `<script type="application/ld+json">` blocks containing an array of location objects with `geo.latitude`, `geo.longitude`, `address`, and `name` fields. This is the same structured data Google uses for search results.

**Expected Results:**
- Love's: ~600 locations (if Sitecore endpoint responds) or 0 (if WAF-blocked)
- Pilot/Flying J: ~800 locations from 50 state pages
- TA/Petro: ~250 locations (limited by CITY_COORDS coverage)
- Total runtime: ~60-90 seconds (well within 300s timeout)

---

### Files Changed

| File | Action |
|------|--------|
| `supabase/functions/sync-official-truck-stops/index.ts` | Full rewrite -- remove Overpass, add corporate fetchers |
| Database migration | TRUNCATE `official_truck_stops` |

