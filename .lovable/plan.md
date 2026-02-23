

## Fix: Replace Fake Brand APIs with Overpass (OpenStreetMap) Queries

### The Problem

The three "public API endpoints" in the current sync function are fabricated URLs:
- `pilotflyingj.com/umbraco/api/...` -- returns HTML, not JSON
- `loves.com/api/sitecore/StoreSearch/...` -- 404
- `ta-petro.com/api/location-search` -- 404

None of these brands offer free, unauthenticated JSON APIs.

### The Solution

Use the **Overpass API** (OpenStreetMap's free, public query API) to fetch real truck stop data with brand names, store numbers, and coordinates. OSM has excellent coverage of major US truck stops with verified brand tags.

### How It Works

For each brand, run a simple Overpass QL query:

```text
[out:json][timeout:30];
(
  node["amenity"="fuel"]["brand"="Pilot"](24.0,-125.0,50.0,-66.0);
  node["amenity"="fuel"]["brand"="Flying J"](24.0,-125.0,50.0,-66.0);
);
out body;
```

This queries the entire continental US bounding box for fuel stations tagged with specific brands. The Overpass API is:
- Free, no API key needed
- Rate-limited but generous (10,000 queries/day)
- Returns real JSON with lat/lng, name, brand, address tags

### Implementation

**File changed:** `supabase/functions/sync-official-truck-stops/index.ts`

Replace the three fake `fetch*` functions with a single `fetchOverpassBrand()` function:

1. **`fetchOverpassBrand(brands: string[])`** -- Queries Overpass for nodes with `amenity=fuel` and matching `brand` tag across the continental US bounding box
2. **Three query groups:**
   - Pilot + Flying J (same parent company)
   - Love's
   - TA + Petro (same parent company)
3. **Parse OSM tags:** Extract `brand`, `ref` (store number), `name`, `addr:street`, `addr:city`, `addr:state` from OSM element tags
4. **UPSERT** into `official_truck_stops` using the existing `(brand, store_number)` composite key
5. **Fallback store_number:** If OSM node lacks a `ref` tag, use the OSM node ID as the store number to ensure uniqueness

**Error handling:**
- 30-second timeout per query via AbortController
- Each brand group is independent -- if one fails, others still sync
- Graceful error messages returned in the summary

**No other files change** -- the table schema, admin UI, config, and frontend are all correct already.

### Technical Details

```
Overpass endpoint: https://overpass-api.de/api/interpreter
Method: POST (form-encoded body with `data=` query)
Response: JSON with `elements` array of nodes
Each node has: id, lat, lon, tags (name, brand, ref, addr:*)
```

### Expected Results

After sync, the database should contain 800+ Pilot/Flying J stops, 600+ Love's stops, and 200+ TA/Petro stops -- all with real coordinates and brand names from OpenStreetMap's verified data.

