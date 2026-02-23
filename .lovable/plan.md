

## Broaden Overpass Query and Add Server-Side Filtering

### Problem
The current query filters by `"name"~"Pilot|Love|..."` which misses locations where the brand is stored in `tags.brand` or `tags.operator` instead of `tags.name`. It also only fetches `node` elements, missing `way` (polygon) locations. Result: ~160 locations instead of thousands.

### Changes (single file)

**File:** `supabase/functions/sync-official-truck-stops/index.ts`

**1. Broaden the Overpass query**

Replace the current name-filtered node-only query:
```
node["amenity"="fuel"]["name"~"...",i](BBOX);out body;
```

With an HGV-based query that fetches both nodes and ways:
```
[out:json][timeout:180];
(
  node["amenity"="fuel"]["hgv"="yes"](BBOX);
  way["amenity"="fuel"]["hgv"="yes"](BBOX);
);
out center;
```

This returns all truck-accessible fuel stations, giving us a much larger dataset to filter from.

**2. Expand `classifyBrand` to check `tags.operator` too**

Current function only checks `tags.brand` and `tags.name`. Update to also check `tags.operator`, and add "Roady's" and "AMBEST" as recognized brands.

**3. Handle `way` elements (use `center.lat`/`center.lon`)**

Current code skips elements without `el.lat`/`el.lon`. Ways don't have those -- they have `el.center.lat`/`el.center.lon` (from `out center`). Update the extraction to fall back to center coordinates.

**4. Generate fallback store numbers for missing `tags.ref`**

Current fallback is `osm-{id}`. Update to a more descriptive format: if city and state are available, use `{Brand}-{City}-{State}` (e.g., `Pilot-Dallas-TX`). Fall back to `{Brand}-{type}-{id}` if no city/state.

**5. Remove the hard requirement for `addr:state`**

Currently, stops without `addr:state` are silently dropped. Many valid OSM entries lack this tag. Instead, still include the stop but with an empty state string -- the data is still valuable for the map.

### Detailed code changes

```typescript
// Remove BRAND_REGEX constant (no longer used in query)

// Updated classifyBrand - check brand, name, AND operator
function classifyBrand(tags: Record<string, string>): string | null {
  const brand = (tags.brand || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();
  const combined = `${brand} ${name} ${operator}`;

  if (combined.includes('flying j')) return 'Flying J';
  if (combined.includes('pilot')) return 'Pilot';
  if (combined.includes("love's") || combined.includes('loves')) return "Love's";
  if (combined.includes('petro')) return 'Petro';
  if (/\bta\b/.test(combined) || combined.includes('travelcenter') || combined.includes('travel center')) return 'TA';
  if (combined.includes("roady's") || combined.includes('roadys')) return "Roady's";
  if (combined.includes('ambest')) return 'AMBEST';
  return null;
}

// Updated query (line 75)
const query = `[out:json][timeout:180];\n(\n  node["amenity"="fuel"]["hgv"="yes"]${bboxStr};\n  way["amenity"="fuel"]["hgv"="yes"]${bboxStr};\n);\nout center;`;

// Updated element processing loop
for (const el of elements) {
  const tags = el.tags;
  if (!tags) continue;

  // Support both nodes (el.lat/el.lon) and ways (el.center.lat/el.center.lon)
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) continue;

  const brand = classifyBrand(tags);
  if (!brand) continue;

  const city = tags['addr:city'] || '';
  const state = (tags['addr:state'] || '').toUpperCase().slice(0, 2);

  // Fallback store_number: Brand-City-State or Brand-type-id
  let storeNumber = tags.ref;
  if (!storeNumber) {
    storeNumber = (city && state)
      ? `${brand}-${city}-${state}`
      : `${brand}-${el.type}-${el.id}`;
  }

  stops.push({
    brand,
    store_number: storeNumber,
    name: tags.name || `${brand} Travel Center`,
    address: tags['addr:street'] || '',
    city,
    state,
    latitude: lat,
    longitude: lon,
    amenities: ['Diesel', 'Parking'],
  });
}
```

### No other files change
The frontend `SyncMapModal` and `InfrastructureTab` remain unchanged -- they still send `{ bbox: [...] }` and receive `{ upserted, total_in_database }`.

