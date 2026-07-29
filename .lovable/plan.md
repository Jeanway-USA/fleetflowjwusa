## Problem

In `src/components/dispatcher/FleetMapView.tsx`, each route is exploded into one GeoJSON feature **per coordinate pair** (`for i in coords.length - 1` → thousands of 2-point LineStrings). This is the cause of both symptoms:

- **Disappears when zoomed out**: Mapbox tiles each GeoJSON source and applies simplification (default `tolerance: 0.375`). Individual 2-point segments a few hundred meters long collapse below the simplification threshold at low zoom and get dropped entirely.
- **Patchy / dots when zoomed in**: separate features with `line-cap: round` render as detached capsules rather than one continuous stroke, and there is no `line-join` continuity between features.

## Fix

### 1. Stop exploding routes into per-point segments
Rebuild `routeFC` so it emits **runs of consecutive coordinates that share the same congestion class**, not one feature per pair:

- Traffic overlay **off** → one single LineString feature per load (whole route, `congestion: 'unknown'`).
- Traffic overlay **on** → walk the congestion array and emit one feature per contiguous run, with each run's last coordinate repeated as the next run's first so there are no visual gaps.

This cuts features from thousands to a handful and restores continuous strokes.

### 2. Make the source render faithfully
When adding the `load-routes` source, pass:
- `tolerance: 0` — no geometry simplification, so the line survives at low zoom
- `buffer: 128` — prevents clipping artifacts at tile edges
- `maxzoom: 16`

Because source options can't be changed after creation, the effect should recreate the source (remove layers + source, re-add) if the options are missing, rather than only calling `setData`.

### 3. Thicken and floor the widths
Raise the low-zoom end of `widthExpr` / `casingWidthExpr` so routes read at national zoom:
- zoom 0 → 2.5 (unselected) / 4 (selected), zoom 3 → 3.5 / 5, zoom 6 → 5 / 7, zoom 10 → 7 / 10, zoom 14 → 9 / 13
- casing consistently ~3px wider than the fill

Also make the traffic-off route depend on `routeFC` being keyed to `overlays.traffic` (the memo needs `overlays.traffic` in its dependency list since feature grouping now depends on it).

### 4. Keep layer ordering intact
No change to the `beforeId` symbol-layer insertion, the casing layer, or the live-truck snapping logic that reads route geometry.

## Files touched

- `src/components/dispatcher/FleetMapView.tsx` (route memo + route layer effect only)

## Verification

Load the dispatcher dashboard in a headless browser, screenshot the Command Center map at continental zoom and at a zoomed-in city level, and confirm the route renders as one continuous colored line at both levels with the Traffic toggle both on and off.
