

## Plan: Intermediate Stops on All Maps with Multi-Waypoint Routing

### Overview

Parse intermediate stop addresses from the `notes` field of each load (under the `=== INTERMEDIATE STOPS ===` section), geocode them, and pass them as waypoints to OSRM so that all maps show the actual multi-stop driving route instead of just origin-to-destination.

Intermediate stop markers will also appear on every map with a distinct icon (orange/amber waypoint dot) and popups showing the stop name and address.

---

### How Intermediate Stops Are Stored

Stops are embedded in the `fleet_loads.notes` text field in this format:
```
=== INTERMEDIATE STOPS ===
Stop 2 (Drop): Ferguson Ent 541, Ferguson Ent 541, 3001 E Kemper Rd, Cincinnati, OH 45241-1514 - 2026-01-26
Stop 3 (Drop): 2) Supply Inc, 2) Supply Inc, 1456 N Keowee St, Dayton, OH 45404-1103 - 2026-01-26
```

Each line has: `Stop N (Type): Facility Name, Facility Name, Address - Date`

---

### Part 1: Shared Stop Parsing Utility

**New file: `src/lib/parseIntermediateStops.ts`**

A small utility function that extracts structured stop data from a load's `notes` string.

- Input: `notes: string | null`
- Output: Array of `{ stopNumber: number, stopType: string, facilityName: string, address: string, date: string | null }`
- Logic:
  - Find the first `=== INTERMEDIATE STOPS ===` section (ignore duplicated ones after `--- Updated from Rate Confirmation ---`)
  - Parse each `Stop N (Type): ...` line using regex
  - Extract the full address portion (everything after the facility name duplication, up to the date)
  - Return the parsed stops sorted by stop number

This utility will be consumed by all map components and the routing layer.

---

### Part 2: Update Routing Utility

**File: `src/lib/routing.ts`**

Add support for multi-waypoint routes:

- **New function: `fetchRouteWithWaypoints(origin, waypoints[], destination)`**
  - Builds the OSRM URL with all coordinates: `origin;wp1;wp2;...;destination`
  - OSRM natively supports up to ~100 waypoints in a single request
  - Cache key includes all waypoint coordinates
  - Returns the full route geometry as `[lat, lng][]` (same format as `fetchRoute`)
  - Falls back to `fetchRoute(origin, destination)` if the waypoint request fails

- **Update `fetchRoutesBatch`** to accept an optional `waypoints` array per pair, calling `fetchRouteWithWaypoints` when waypoints exist

---

### Part 3: Update LoadRouteMap (Driver Active Load Card)

**File: `src/components/driver/LoadRouteMap.tsx`**

- Add optional `notes` prop to `LoadRouteMapProps`
- Parse intermediate stops from `notes` using the shared utility
- Geocode each stop address (alongside origin/destination geocoding)
- Call `fetchRouteWithWaypoints(origin, [stop1, stop2, ...], destination)` instead of `fetchRoute(origin, destination)`
- Render an amber/orange waypoint marker for each intermediate stop with a popup showing stop number, facility name, and address
- Include stop coordinates in the bounds calculation

**File: `src/components/driver/ActiveLoadCard.tsx`**

- Pass `load.notes` to `LoadRouteMap`: `<LoadRouteMap origin={load.origin} destination={load.destination} notes={load.notes} />`

---

### Part 4: Update FleetMapView (Dispatcher Dashboard)

**File: `src/components/dispatcher/FleetMapView.tsx`**

- Add `notes` to the Supabase query SELECT for in-transit loads
- Parse intermediate stops for each load
- Geocode stop addresses alongside origin/destination geocoding
- When fetching routes, pass waypoints to `fetchRouteWithWaypoints`
- Render waypoint markers on the map for each intermediate stop (same amber icon)
- Update the `LoadWithLocation` interface to include parsed stop data

---

### Part 5: Update TripFuelPlanner (Driver Fuel Planner)

**File: `src/components/driver/TripFuelPlanner.tsx`**

- Add optional `notes` prop to `TripFuelPlannerProps`
- Parse intermediate stops and geocode them
- Use `fetchRouteWithWaypoints` for accurate route following all stops
- Render waypoint markers on the fuel planner map
- Include stop coordinates in bounds calculation

**File: `src/pages/DriverDashboard.tsx`**

- Pass `activeLoad.notes` to `TripFuelPlanner`

---

### Part 6: Waypoint Marker Icon

A new shared Leaflet `divIcon` used consistently across all maps:

- Amber/orange diamond or numbered circle marker (visually distinct from green origin, red destination, and blue truck markers)
- Smaller than origin/destination markers (18px)
- Popup shows: "Stop N (Drop/Pick)" + facility name + address

---

### Technical Details

**OSRM Multi-Waypoint URL format:**
```
GET https://router.project-osrm.org/route/v1/driving/
  {originLng},{originLat};{wp1Lng},{wp1Lat};{wp2Lng},{wp2Lat};...;{destLng},{destLat}
  ?overview=full&geometries=geojson
```

**Stop address parsing regex:**
```
/Stop\s+(\d+)\s+\((\w+)\):\s*(.+?),\s*(.+?)(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/
```

The address portion (after the duplicated facility name) is what gets geocoded.

**Geocoding rate limiting:**
- Intermediate stops use the same Nominatim geocoding with existing rate limiting (1.1s between requests)
- Results are cached in the existing `geocodeCache` so repeated renders are instant
- For a load with 7 intermediate stops, initial geocoding takes about 8-10 seconds but is cached for the session

**Graceful fallback:**
- If any intermediate stop fails to geocode, it is skipped as a waypoint but the remaining stops still form the route
- If the multi-waypoint OSRM request fails, falls back to simple origin-to-destination routing
- If `notes` is null or contains no intermediate stops, behavior is identical to current (no changes)

---

### Files Summary

| Action | File | Details |
|--------|------|---------|
| Create | `src/lib/parseIntermediateStops.ts` | Shared parser for stop data from notes |
| Modify | `src/lib/routing.ts` | Add `fetchRouteWithWaypoints` function |
| Modify | `src/components/driver/LoadRouteMap.tsx` | Accept `notes`, geocode stops, multi-waypoint routing, render stop markers |
| Modify | `src/components/driver/ActiveLoadCard.tsx` | Pass `notes` to `LoadRouteMap` |
| Modify | `src/components/dispatcher/FleetMapView.tsx` | Fetch `notes`, parse stops, multi-waypoint routing, render stop markers |
| Modify | `src/components/driver/TripFuelPlanner.tsx` | Accept `notes`, parse stops, multi-waypoint routing, render stop markers |
| Modify | `src/pages/DriverDashboard.tsx` | Pass `notes` to `TripFuelPlanner` |

No database changes needed. No new dependencies needed.

