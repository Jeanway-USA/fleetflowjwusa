## Diagnosis

Two crashes in the console explain the black canvas:

1. `Cannot read properties of undefined (reading 'applyProjectionUpdate')` — thrown from Mapbox GL v3's `_updateProjection` during style load.
2. `Cannot read properties of undefined (reading 'get')` — thrown from Mapbox's `addImages` while loading style sprite icons.

Both are known Mapbox GL v3 issues that fire when the map initializes with the default **globe** projection in an environment where the style/sprite hasn't fully resolved before the projection is updated. When either throws, the WebGL painter aborts and the canvas stays black — the only DOM still rendered is our overlay control panel, which matches what you're seeing.

## Fix

Force the map to use the Mercator projection (skips the globe init path that crashes) and defer layer/source setup until *after* the style is fully idle, not just `load`.

Edit `src/components/dispatcher/FleetMapView.tsx` inside `MapboxCanvas`:

1. Pass `projection: 'mercator'` in the `new mapboxgl.Map({...})` options.
2. Replace `map.on('load', () => setStyleReady(true))` with a handler that waits for `style.load` and one additional `idle` tick before flipping `styleReady`, so sprite images finish loading before we call `addLayer`.
3. In the theme-change effect, use the same `style.load` + `idle` gate before re-adding sources/layers.
4. Guard every `addSource`/`addLayer` call with `map.isStyleLoaded()` and swallow-log errors (some are already guarded; extend to the traffic, routes, points, and trucks effects).
5. Silence the noisy RainViewer 404s: subscribe to `map.on('error', ...)` and ignore errors whose `error.message` starts with `Failed to fetch https://tilecache.rainviewer.com` (some radar tiles legitimately 404 at world zoom levels).

## Verification

- Reload `/dispatcher-dashboard` → map tiles render (light/dark navigation style).
- Toggle Traffic → congestion-colored lines appear.
- Toggle Weather Radar → RainViewer raster overlays; residual tile 404s no longer flood the console.
- Click a truck marker → forecast sidebar appears and map re-centers.

No schema, edge function, or non-map file changes.
