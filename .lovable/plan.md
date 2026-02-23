

## Greedy Name/Brand Regex Query with Finer Chunking and Deduplication

### Problem
The `hgv=yes` tag is rarely applied by US OSM contributors, resulting in only ~600 locations. We need to query purely by name/brand regex to capture thousands more stops.

### Changes

#### 1. Edge Function (`supabase/functions/sync-official-truck-stops/index.ts`)

**Replace the Overpass query** -- drop `amenity=fuel` and `hgv=yes` entirely. Query `nwr` by name and brand regex:

```
[out:json][timeout:300];
(
  nwr["name"~"Pilot|Flying J|Love's|Loves|TravelCenters of America|\\bTA\\b|Petro|AMBEST|Roady's",i](BBOX);
  nwr["brand"~"Pilot|Flying J|Love's|Loves|TravelCenters of America|\\bTA\\b|Petro|AMBEST|Roady's",i](BBOX);
);
out center;
```

**Add proximity deduplication** before upsert:
- Sort stops by brand, then lat
- For each stop, check if the previous stop has the same brand and is within 0.01 degrees (~1km) on both lat and lon
- If so, skip the duplicate (keep the first one encountered)
- This prevents the same physical location from being inserted twice when Overpass returns both a node and a way for it

**Keep everything else** -- retry logic, classifyBrand, fallback store_number, batch upsert -- unchanged.

#### 2. Frontend (`src/components/superadmin/SyncMapModal.tsx`)

**Increase regions from 6 to 12** by splitting each current region roughly in half (east/west or north/south). Smaller bounding boxes prevent Overpass timeouts on the greedy regex query.

New region grid:
| # | Name | Bounds (S, W, N, E) |
|---|------|---------------------|
| 1 | New England | 41.0, -73.5, 47.5, -66.5 |
| 2 | Mid-Atlantic | 37.0, -82.0, 41.0, -73.5 |
| 3 | Southeast Coast | 30.0, -85.0, 37.0, -75.0 |
| 4 | Deep South | 24.0, -92.0, 30.0, -75.0 |
| 5 | Great Lakes | 41.0, -92.0, 49.5, -82.0 |
| 6 | Upper Midwest | 36.0, -104.0, 49.5, -92.0 |
| 7 | Texas | 24.0, -104.0, 37.0, -97.0 |
| 8 | Gulf States | 24.0, -97.0, 37.0, -85.0 |
| 9 | Mountain North | 42.0, -117.0, 49.5, -104.0 |
| 10 | Mountain South | 31.0, -117.0, 42.0, -104.0 |
| 11 | Pacific Northwest | 42.0, -125.0, 49.5, -117.0 |
| 12 | California | 24.0, -125.0, 42.0, -117.0 |

Update the status text from "6 US regions" to reference `regions.length` dynamically (already does in most places).

### Technical Details

**Deduplication algorithm** (runs in the edge function after classification, before upsert):
```typescript
function deduplicateStops(stops: StopRecord[]): StopRecord[] {
  stops.sort((a, b) => a.brand.localeCompare(b.brand) || a.latitude - b.latitude);
  const result: StopRecord[] = [];
  for (const stop of stops) {
    const prev = result[result.length - 1];
    if (prev && prev.brand === stop.brand &&
        Math.abs(prev.latitude - stop.latitude) < 0.01 &&
        Math.abs(prev.longitude - stop.longitude) < 0.01) {
      continue; // skip duplicate
    }
    result.push(stop);
  }
  return result;
}
```

**File changes:**
| File | Action |
|------|--------|
| `supabase/functions/sync-official-truck-stops/index.ts` | Edit -- greedy query + dedup |
| `src/components/superadmin/SyncMapModal.tsx` | Edit -- 12 regions instead of 6 |

