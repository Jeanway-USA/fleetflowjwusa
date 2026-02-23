

## Truck Stop Sync -- Grid Progress Map and Live ETA Tracker

### Overview

Move the geographic chunking loop from the Edge Function to the frontend. The Edge Function becomes a simple single-region worker that accepts one bounding box, fetches from Overpass, upserts, and returns a count. The frontend orchestrates the 6 regions sequentially, rendering a live Leaflet map with color-coded rectangles and a progress bar with ETA.

### Architecture

```text
Frontend (SyncMapModal)              Edge Function (simplified)
  |                                    |
  |-- Region 1 bbox ------------------>|-- Overpass query
  |<-- { upserted: 245 } -------------|-- Upsert to DB
  |   [delay 3s]                       |
  |-- Region 2 bbox ------------------>|
  |<-- { upserted: 180 } -------------|
  |   ...                              |
  |-- Region 6 bbox ------------------>|
  |<-- { upserted: 310 } -------------|
  |                                    |
  | Calculate ETA, update map colors   |
```

### 1. Edge Function Simplification (`sync-official-truck-stops/index.ts`)

Strip the server-side loop. The function now:

- Accepts `{ bbox: [minLat, minLon, maxLat, maxLon] }` from the request body
- Builds a single Overpass query with that bbox: `node["amenity"="fuel"]["name"~"Pilot|Love|...",i](minLat,minLon,maxLat,maxLon);`
- Classifies brands using the existing `classifyBrand()` logic
- Upserts matching stops into `official_truck_stops`
- Returns `{ upserted: number, total_in_database: number }`
- No delays, no looping -- single request in, single response out
- Auth check (super admin) remains unchanged

### 2. New Component: `SyncMapModal` (`src/components/superadmin/SyncMapModal.tsx`)

A Dialog-based modal opened from the Infrastructure tab when the user clicks "Sync Official Truck Stop Data".

**State:**
- `regions`: Array of 6 region objects with `name`, `bbox` (as `[south, west, north, east]`), and `status` (`'pending' | 'fetching' | 'done' | 'error'`)
- `currentIndex`: Which region is being fetched (-1 = not started)
- `results`: Per-region upsert counts
- `startTime`: Timestamp when sync began
- `isRunning`: Boolean

**Regions (same 6 as current edge function):**
| Region | Bounds (S, W, N, E) |
|--------|---------------------|
| Northeast | 37.0, -82.0, 47.5, -66.5 |
| Southeast | 24.0, -92.0, 37.0, -75.0 |
| Midwest | 36.0, -104.0, 49.5, -82.0 |
| South Central | 24.0, -104.0, 37.0, -92.0 |
| Northwest | 40.0, -125.0, 49.5, -104.0 |
| Southwest | 24.0, -125.0, 40.0, -104.0 |

**`runSync` function:**
1. Set `isRunning = true`, record `startTime`
2. Loop through regions sequentially
3. Set current region status to `'fetching'`
4. `await supabase.functions.invoke('sync-official-truck-stops', { body: { bbox: region.bbox } })`
5. On success: set status to `'done'`, store upsert count
6. On error: set status to `'error'`
7. `await delay(3000)` between calls (rate limiting)
8. After loop: toast summary, refetch truck stop stats

**ETA calculation:**
```
elapsedMs = Date.now() - startTime
avgMsPerChunk = elapsedMs / completedChunks
etaMs = avgMsPerChunk * remainingChunks
```

**UI Layout inside the Dialog (max-w-3xl):**

- **Map** (h-72): Leaflet `MapContainer` fitted to US bounds `[[24, -125], [50, -66]]` with 6 `<Rectangle>` layers, color-coded:
  - Gray (`#94a3b8`, opacity 0.2): Pending
  - Yellow (`#eab308`, opacity 0.3) + dashed stroke: Currently fetching
  - Green (`#22c55e`, opacity 0.3): Done
  - Red (`#ef4444`, opacity 0.3): Error
  - Each rectangle has a `<Popup>` or `<Tooltip>` showing region name and count

- **Progress section** below map:
  - Shadcn `<Progress />` bar driven by `(completedChunks / totalChunks) * 100`
  - Text: "Fetching Region {n} of 6 -- {regionName}... Estimated Time Remaining: {eta}s"
  - After completion: "Sync complete! {totalUpserted} stops synced across 6 regions."

- **Start button**: "Begin Sync" button at the bottom, disabled while running

### 3. InfrastructureTab Changes

- Import `SyncMapModal`
- Replace the inline `handleSync` with opening the modal: `setSyncModalOpen(true)`
- Add `<SyncMapModal open={syncModalOpen} onOpenChange={setSyncModalOpen} onComplete={() => refetchStops()} />`
- The existing stats card (brand counts, last synced) remains unchanged

### File Changes Summary

| File | Action |
|------|--------|
| `supabase/functions/sync-official-truck-stops/index.ts` | Rewrite -- accept single bbox, remove loop/delays |
| `src/components/superadmin/SyncMapModal.tsx` | New -- map + progress modal |
| `src/components/superadmin/InfrastructureTab.tsx` | Edit -- open modal instead of direct invoke |

### Technical Notes

- Uses `react-leaflet`'s `Rectangle` component (already available in the installed package)
- Map tiles from OpenStreetMap (same as existing `FuelPlannerMap`)
- No new dependencies required
- The 3-second delay between chunks is enforced on the frontend, giving the Overpass API breathing room
- Each edge function call is independent and fast (single region, ~5-15s)
- If a region fails, the loop continues to the next -- partial syncs are fine since data is upserted

