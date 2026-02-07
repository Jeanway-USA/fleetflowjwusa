

## Plan: Fullscreen Map Expansion + Real Road Routing for All Maps

### Overview

Two improvements across all map components in the application:

1. **Click-to-maximize**: Every map can be clicked/tapped to open in a fullscreen dialog overlay with full interactivity (zoom, pan, etc.)
2. **Real truck routes**: Replace straight-line polylines with actual road-following routes fetched from the OSRM (Open Source Routing Machine) public API

---

### Part 1: Shared Routing Utility

**New file: `src/lib/routing.ts`**

A shared utility that fetches actual driving routes from the OSRM public API and decodes the response into Leaflet-compatible coordinate arrays.

- **Function: `fetchRoute(origin, destination)`**
  - Calls `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson`
  - Returns an array of `[lat, lng]` coordinate pairs representing the actual road route
  - Falls back to a straight line between origin and destination if the API call fails or times out
  - Includes a simple in-memory cache keyed by origin+destination coordinates to avoid redundant API calls
  - Uses `geometries=geojson` format so coordinates come back as plain JSON arrays (no polyline decoding library needed)

- **Function: `fetchRoutesBatch(pairs)`**
  - Accepts multiple origin/destination pairs
  - Processes them sequentially with a small delay to respect rate limits on the public OSRM server
  - Returns a Map of route key to coordinate arrays

**Note on OSRM**: The public OSRM server (`router.project-osrm.org`) uses car routing profiles. There is no public truck-specific profile, but the road routes it returns follow highways and major roads that trucks use. This is a massive improvement over straight lines and accurately represents real driving paths. If a self-hosted OSRM instance with truck profiles is desired in the future, only the base URL in this utility needs to change.

---

### Part 2: Fullscreen Map Dialog Component

**New file: `src/components/shared/ExpandableMap.tsx`**

A reusable wrapper component that:
- Renders children (the inline map) normally
- Shows an "Expand" button overlay (maximize icon) in the top-right corner of the map
- When clicked, opens a Radix Dialog taking up ~95% of the viewport (`max-w-[95vw] max-h-[95vh]`)
- The dialog renders a new, full-size `MapContainer` with the same markers, routes, and popups as the inline version
- The fullscreen map has full interactivity: zoom controls, dragging, scroll-wheel zoom, etc.
- A close button (X) in the top-right dismisses the dialog

The component accepts a `renderMap` prop -- a function that receives `{ isExpanded: boolean }` and returns the MapContainer JSX. This lets each map component control what gets rendered in both the inline and expanded views.

---

### Part 3: Update Each Map Component

#### A. LoadRouteMap (`src/components/driver/LoadRouteMap.tsx`)

Currently the simplest map -- shows a static route preview on the ActiveLoadCard.

**Changes:**
- Import and use `fetchRoute` from `src/lib/routing.ts` to get real road coordinates
- Replace the 2-point `Polyline` with the full route coordinate array
- Add `useState` for the route coordinates, fetch them in a `useEffect` alongside geocoding
- Wrap the map in `ExpandableMap` so clicking it opens a fullscreen version
- In expanded mode: enable zoom controls, dragging, and scroll-wheel zoom (currently all disabled)
- Fall back to a straight line if route fetch fails (graceful degradation)

#### B. FleetMapView (`src/components/dispatcher/FleetMapView.tsx`)

The dispatcher's fleet overview showing all in-transit loads.

**Changes:**
- Import `fetchRoute` and store route geometries in a `Map<string, [number, number][]>` keyed by load ID
- When loads change, fetch routes for each origin/destination pair (using the batch function with caching)
- Replace each load's 2-point `Polyline` with the full route coordinate array
- Wrap the map area in `ExpandableMap`
- In expanded mode: the map fills the dialog with all the same markers, popups, route lines, and legend
- Add the expand button to the card header area

#### C. TripFuelPlanner (`src/components/driver/TripFuelPlanner.tsx`)

The fuel stop planner map for drivers.

**Changes:**
- Import `fetchRoute` and fetch the real route when origin/destination coordinates are available
- Replace the 2-point `Polyline` with the full route coordinate array
- Wrap the map in `ExpandableMap`
- In expanded mode: fuel stop markers remain interactive with popups showing pricing details
- The expanded map is especially useful here since the inline map is only 192px tall

---

### Part 4: Implementation Details

**OSRM API call format:**
```
GET https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
```

Response structure (simplified):
```json
{
  "routes": [{
    "geometry": {
      "coordinates": [[lng, lat], [lng, lat], ...],
      "type": "LineString"
    },
    "distance": 123456,
    "duration": 12345
  }]
}
```

The coordinates come back as `[lng, lat]` (GeoJSON standard) and need to be flipped to `[lat, lng]` for Leaflet.

**Caching strategy:**
- Routes are cached in-memory using a key derived from rounded coordinates (to 4 decimal places)
- Cache persists for the browser session
- Avoids redundant fetches when components re-render or when the same route appears in multiple views

**Rate limiting:**
- The public OSRM server is for light use; we add a 200ms delay between sequential requests
- For FleetMapView with multiple loads, routes are fetched incrementally (not all at once)
- Cached routes return instantly on subsequent renders

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Create | `src/lib/routing.ts` | OSRM route fetching utility with cache and fallback |
| Create | `src/components/shared/ExpandableMap.tsx` | Reusable click-to-expand map wrapper with Dialog |
| Modify | `src/components/driver/LoadRouteMap.tsx` | Add real routing + expand capability |
| Modify | `src/components/dispatcher/FleetMapView.tsx` | Add real routing for all loads + expand capability |
| Modify | `src/components/driver/TripFuelPlanner.tsx` | Add real routing + expand capability |

No database changes needed. No new dependencies needed (OSRM returns GeoJSON which is plain JSON, and Dialog is already available from Radix UI).

