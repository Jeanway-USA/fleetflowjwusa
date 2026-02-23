

## Fix: Bounding Box Chunking for Complete Truck Stop Sync

### Problem
The current function queries the entire US in a single Overpass request per brand group. This hits Overpass's server-side timeout/memory limits, returning only ~100 locations instead of thousands.

### Solution
Split the US into 6 regional bounding boxes and use a combined regex-based name query (instead of per-brand queries) to fetch all major brands in one pass per region. This reduces total API calls from 3 (one per brand group) to 6 (one per region), while keeping each query small enough to succeed.

### Implementation Details

**File:** `supabase/functions/sync-official-truck-stops/index.ts`

**1. Replace brand-based querying with region-based chunking**

Define 6 US regional bounding boxes:
- **Northeast** (37.0, -82.0, 47.5, -66.5)
- **Southeast** (24.0, -92.0, 37.0, -75.0)
- **Midwest** (36.0, -104.0, 49.5, -82.0)
- **South Central** (24.0, -104.0, 37.0, -92.0)
- **Northwest** (40.0, -125.0, 49.5, -104.0)
- **Southwest** (24.0, -125.0, 40.0, -104.0)

**2. Use a single regex query per region**

Instead of separate brand queries, use one Overpass query per region that matches all brands via regex:
```
[out:json][timeout:180];
node["amenity"="fuel"]["name"~"Pilot|Love|Loves|TA |TravelCenters|Flying J|Petro",i](BBOX);
out body;
```

This captures all major brands in one call, reducing total API calls and improving coverage.

**3. Sequential fetching with 5-second delays**

Loop through regions sequentially with a 5-second delay between each to respect rate limits. Total runtime: ~30-60 seconds for all 6 regions.

**4. Brand classification from name/tags**

After fetching, classify each result into a brand based on the `brand` tag or by matching the `name` against known patterns:
- Name contains "Pilot" -> brand "Pilot"
- Name contains "Flying J" -> brand "Flying J"  
- Name contains "Love" -> brand "Love's"
- Name contains "TA " or "TravelCenters" -> brand "TA"
- Name contains "Petro" -> brand "Petro"

**5. Deduplicate by OSM node ID before upserting**

Since regions overlap slightly, deduplicate results by OSM node ID before upserting into the database.

**6. Upsert all results at once**

After all regions are fetched and deduplicated, upsert the full master array into `official_truck_stops` using the existing batch logic (200 rows per batch).

### Expected Results
- 700+ Pilot/Flying J locations
- 600+ Love's locations  
- 250+ TA/Petro locations
- Total: 1,500+ official truck stops

### No Other Files Change
The table schema, admin UI, config, and frontend all remain the same.

