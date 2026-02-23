

## Simplified Cache-on-Demand with Mapbox Search API

### Prerequisites

A `MAPBOX_ACCESS_TOKEN` secret needs to be added to the project. This will be requested before implementation begins.

### 1. Database Migration

**Alter `truck_stops` table** to support Mapbox place IDs instead of OSM node IDs:

- Add column `place_id` (text, UNIQUE)
- Add column `address` (text)
- Drop the `osm_id` unique constraint and column (only 7 rows exist currently, safe to clear)
- Truncate existing data (7 stale Overpass rows) since the new source is Mapbox

```sql
TRUNCATE truck_stops;
ALTER TABLE truck_stops DROP COLUMN IF EXISTS osm_id;
ALTER TABLE truck_stops ADD COLUMN place_id text UNIQUE NOT NULL;
ALTER TABLE truck_stops ADD COLUMN address text;
```

Final schema:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| place_id | text | UNIQUE, Mapbox feature ID |
| name | text | Real stop name |
| brand | text | nullable |
| address | text | Full formatted address |
| latitude | numeric | NOT NULL |
| longitude | numeric | NOT NULL |
| state | text | NOT NULL |
| city | text | nullable |
| amenities | text[] | |
| source | text | default 'mapbox' |
| fetched_at | timestamptz | |
| created_at | timestamptz | |

### 2. Edge Function Rewrite (`landstar-fuel-stops/index.ts`)

**Simplified architecture -- 3 clean steps:**

**Step A: Sample waypoints from route**
- Take the route polyline and sample 5-10 equidistant points (max 10, no matter how long the route)
- Use the existing `sampleRoutePoints` utility

**Step B: Mapbox Search for each waypoint**
- For each sampled point, call `https://api.mapbox.com/search/searchbox/v1/forward` with:
  - `q`: "truck stop" (or cycle through "Pilot", "Love's", "TA" for richer results)
  - `proximity`: `lng,lat` of the waypoint
  - `limit`: 10
  - `types`: "poi"
  - `access_token`: from `MAPBOX_ACCESS_TOKEN` secret
- Each call wrapped in try/catch with 5s timeout
- If Mapbox returns 429 or errors, skip that waypoint gracefully

**Step C: Upsert and query**
- Parse Mapbox response: extract `properties.mapbox_id` (place_id), `properties.name`, `properties.full_address`, `geometry.coordinates`, `properties.context` (for city/state)
- UPSERT into `truck_stops` on `place_id` conflict
- Query `truck_stops` for all stops within `corridor_miles` of the route
- Enrich with EIA diesel prices, LCAPP discounts, IFTA credits (preserved from current code)
- Sort by `distance_from_origin`, return

**Preserved from current code:**
- CORS headers and auth validation
- EIA diesel price fetching
- LCAPP partner matching and discount calculation
- IFTA tax credit enrichment
- Projected savings calculation
- Landstar scrape path (if credentials exist)
- `fuel_stops_cache` for 6h TTL fast-path
- Interpolated fallback if both Mapbox and local DB are empty

**Removed:**
- All Overpass API code (`fetchOverpassStops`, `chunkRouteToBBoxes`, etc.)
- Overpass-specific type definitions

**Error handling:**
- Each Mapbox fetch in try/catch with AbortController (5s timeout)
- If all Mapbox calls fail, fall back to local `truck_stops` table
- If local table is also empty, fall back to interpolated stops
- Never crashes -- always returns at least interpolated data

### 3. Frontend (`TripFuelPlanner.tsx`)

**Minor updates:**
- Add `address` to the `FuelStop` interface
- Show address in the stop list instead of just `city, state`
- Update loading skeleton text to "Fetching live truck stops..." when `isFetching` is true
- Show a "Live" badge when `source === 'mapbox'`

No structural changes needed -- the component already handles the response shape correctly.

### File Changes

| File | Change |
|------|--------|
| Database migration | Alter `truck_stops`: drop `osm_id`, add `place_id` + `address` |
| `supabase/functions/landstar-fuel-stops/index.ts` | Replace Overpass with Mapbox Search; simplify to 5-10 waypoint searches |
| `src/components/driver/TripFuelPlanner.tsx` | Add `address` field display; update loading/source badges |

### Secret Required

| Secret | Value |
|--------|-------|
| `MAPBOX_ACCESS_TOKEN` | User's Mapbox public access token (from mapbox.com account) |

