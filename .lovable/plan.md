

## Cache-on-Demand Architecture: Live Overpass API Fuel Stops

### Overview

Replace the static `KNOWN_STOPS` array with a live-fetching architecture that queries OpenStreetMap's Overpass API for real truck stops along the route, upserts them into a persistent `truck_stops` table, and then queries that table for corridor-filtered results.

### Architecture Flow

```text
Request comes in with route polyline
       |
       v
1. Query local `truck_stops` table for stops along corridor
       |
       v
2. If density is sparse (< 1 stop per 100mi):
   a. Chunk the route into bounding boxes (~50mi segments)
   b. Query Overpass API for each chunk (truck fuel stops)
   c. Parse OSM response, extract real names/coords
   d. UPSERT into `truck_stops` (OSM node ID = deterministic key)
   e. Re-query `truck_stops` for corridor
       |
       v
3. Enrich with EIA diesel prices + LCAPP discounts + IFTA credits
4. Sort by distance_from_origin, return to frontend
```

### Database Changes

**New table: `truck_stops`** (persistent, grows over time)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| osm_id | bigint | UNIQUE -- OpenStreetMap node ID, prevents duplicates |
| name | text | Real stop name from OSM (e.g., "Pilot Travel Center") |
| brand | text | nullable -- OSM "brand" tag |
| latitude | numeric | NOT NULL |
| longitude | numeric | NOT NULL |
| state | text | NOT NULL -- derived from coords |
| city | text | nullable |
| amenities | text[] | parsed from OSM tags |
| source | text | default 'overpass' |
| fetched_at | timestamptz | when this stop was last refreshed from OSM |
| created_at | timestamptz | default now() |

RLS: Service role only (edge function uses service key). No user-facing RLS needed since users never query this table directly.

**No PostGIS needed** -- we continue using the existing haversine-based corridor filtering which works well and avoids needing the PostGIS extension.

### Edge Function Changes (`landstar-fuel-stops/index.ts`)

**Remove:** The entire `KNOWN_STOPS` array (~220 lines of hardcoded data).

**Add: `fetchOverpassStops(bbox)` function:**
- Constructs an Overpass QL query targeting `node["amenity"="fuel"]` with filters for truck-relevant tags (`hgv=yes`, or brand names like Pilot, Love's, TA, Flying J, Petro, Sapp Bros, Buc-ee's, Casey's)
- Makes HTTP GET to `https://overpass-api.de/api/interpreter`
- Parses the JSON response, extracting: `id` (OSM node ID), `tags.name`, `tags.brand`, `lat`, `lon`, `tags.addr:city`, `tags.addr:state`
- Returns parsed array

**Add: `upsertStops(supabase, stops)` function:**
- Takes parsed Overpass results
- Calls `supabase.from('truck_stops').upsert(...)` with `onConflict: 'osm_id'`
- Updates `fetched_at` on conflict so we know freshness

**Add: `queryLocalStops(supabase, polyline, corridorMiles)` function:**
- Computes bounding box from route polyline
- Queries `truck_stops` table within that bounding box
- Applies haversine corridor filtering (same logic as today)
- Returns filtered + sorted array

**Modified main flow:**
1. Query local `truck_stops` for corridor stops
2. Check density: if stops < `max(3, tripMiles/100)`, trigger Overpass fetch
3. Chunk route into ~50mi bounding boxes, fetch each from Overpass (with 2s timeout per chunk)
4. Upsert results, re-query local table
5. Enrich all stops with EIA prices, LCAPP discounts, IFTA credits
6. Sort by `distance_from_origin`, return

**Preserved:** Landstar scrape path (if driver has credentials), EIA pricing, LCAPP partner discounts, IFTA credits, projected savings calculation, cache path for `fuel_stops_cache`.

**Error handling:** Each Overpass fetch is wrapped in try/catch with a 5-second timeout. If Overpass rate-limits (HTTP 429) or times out, we log the error and gracefully fall back to whatever is already in the local `truck_stops` table. If the table is also empty, we fall back to the existing interpolated stops generator.

### Frontend Changes

**None required.** The `TripFuelPlanner.tsx` component already consumes the `fuel_stops` array from the edge function response. The response shape stays identical -- the stops will just have real OSM data instead of hardcoded entries.

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/landstar-fuel-stops/index.ts` | Remove KNOWN_STOPS array; add Overpass fetch, upsert, and local query functions; modify main handler flow |
| Database migration | Create `truck_stops` table with `osm_id` unique constraint |

### Technical Details

**Overpass QL query per chunk:**
```
[out:json][timeout:5];
(
  node["amenity"="fuel"]["hgv"="yes"](minLat,minLng,maxLat,maxLng);
  node["amenity"="fuel"]["brand"~"Pilot|Love|Flying J|TA |Petro|Sapp|Casey|Buc-ee"](minLat,minLng,maxLat,maxLng);
);
out body;
```

**Chunking strategy:**
- Sample route polyline every 50 miles
- For each sample point, create a bounding box of +/- 0.3 degrees (~20mi radius)
- Merge overlapping boxes to reduce API calls
- Limit to max 15 chunks per request to avoid Overpass rate limits

**Deduplication:**
- OSM node ID is the deterministic key (bigint, globally unique)
- UPSERT with `ON CONFLICT (osm_id) DO UPDATE SET fetched_at = now()` keeps data fresh without duplicates
- Frontend deduplication is unnecessary since the DB enforces uniqueness

**Freshness:** Stops older than 30 days in `truck_stops` are eligible for re-fetch on the next request that passes through their area. This keeps the database current without aggressive polling.

