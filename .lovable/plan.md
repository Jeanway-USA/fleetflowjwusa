## What I verified

- Nothing in the app reads the dispatcher's browser GPS. `navigator.geolocation` is used only in `src/components/driver/LocationSharing.tsx` (the driver dashboard toggle). So no dispatcher position is being written anywhere.
- The real cause of the wrong dots is in `FleetMapView.tsx` (line ~339-351): a truck marker is placed from **any** `driver_locations` row, even when `is_sharing = false` or the row is weeks old, and when there's no row at all it **fabricates** a position by interpolating between origin and destination based on load status.
- Current data confirms it. Three rows exist; one is `is_sharing: false`, last updated 2026-06-14, at 46.711, -117.169 — Pullman, WA on the Idaho border. That is exactly the "me in Washington" dot: a stale, switched-off location still being drawn. The "Delaware" dot another user sees is the interpolated fake position for a load whose origin/destination geocoded differently in that session (Mapbox vs. Nominatim fallback), which is why it differs per viewer.

## Plan

**1. Only draw real, live driver GPS**
- In `FleetMapView.tsx`, use a `driver_locations` row as a truck position only when `is_sharing = true` and the row is fresh.
- Delete the `interpolatePosition` / `getProgressFromStatus` fallback entirely — no synthetic truck dots. A load with no live driver simply shows its route and stop pins, no truck marker.
- Filter the DB query and the realtime handler to `is_sharing = true` so switched-off drivers can't linger in the client cache.
- Update the "live" freshness window to 20 minutes so it comfortably covers the driver app's 10-minute write interval (today's 10-minute cutoff makes a genuinely-sharing driver flicker off right before each update).

**2. Make the marker honest about state**
- Truck popup shows the driver name, unit, and "Updated X min ago".
- The "N live" counter counts only markers actually drawn.
- Loads in transit with no live GPS get a small "No live GPS" indicator in the load list/panel rather than a misplaced dot.

**3. Snap to the route, and re-anchor the route when the driver isn't on it**
- Keep the existing snap-to-route behavior, but only apply it when the driver is within a sane corridor of the drawn line (~10 miles). Beyond that, do not snap — showing the driver's true coordinates matters more than a pretty line.
- When a live driver is more than ~10 miles off the drawn route (detour, reroute, wrong-direction), request a fresh route from the `route-load` function using the **driver's current position as the origin** and the load's destination (plus remaining stops), and draw that as the load's active route. This is throttled per load (rate-limited and only re-fired on meaningful movement) so it doesn't hammer Mapbox.
- The re-anchored geometry is used for display; the original planned route stays untouched in the database.

**4. Data hygiene**
- One migration to clear the stale coordinates on rows where `is_sharing = false`, so no historical ghost positions can resurface.

## Technical notes

- Files touched: `src/components/dispatcher/FleetMapView.tsx` (primary), `src/lib/geo/snapToRoute.ts` (return the off-route distance so the caller can decide whether to snap), and one database migration.
- `src/lib/geocoding.ts` keeps `interpolatePosition` exported in case other views use it; the map just stops calling it.
- No change to the driver-side sharing UI; its writes already carry accurate lat/lng, accuracy, speed and heading.
