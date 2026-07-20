## Goal
Add a sleek overlay control menu to the In Transit map in the Command Center with two toggle switches — "Weather Radar" and "Traffic Conditions" — wired to placeholder Leaflet layer logic ready for future third-party API keys.

## Changes

### `src/components/dispatcher/FleetMapView.tsx`
1. Import shadcn `Switch` (`@/components/ui/switch`), `Label`, and `Cloud` / `TrafficCone` icons from lucide-react.
2. Add two React state flags: `weatherEnabled`, `trafficEnabled` (both default `false`). Persist to `localStorage` (`fleet-map-overlays`) so preferences survive reload.
3. Inside `renderMapContent`, next to the existing `MapContainer`, render a floating control card absolutely positioned at `top-2 right-2` (right-12 on non-expanded views to avoid overlapping the existing Expand button from `ExpandableMap`). Styling:
   - `bg-gray-900/80 backdrop-blur-sm text-white border border-white/10 rounded-lg shadow-lg p-3`
   - `z-[500]` so it sits above tiles but below Leaflet popups.
   - Two rows: icon + label + `Switch`. Switch uses accent color via `data-[state=checked]:bg-primary` (amber gold, matches design system).
4. Add two conditional `TileLayer` components inside `MapContainer`:
   - Weather: OpenWeatherMap precipitation URL pattern `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${key}` behind a `weatherEnabled && apiKey` guard. Since no key is configured yet, render a placeholder OSM-styled overlay using a transparent tile stub (leave URL variable + `TODO` comment) so the toggle visibly no-ops without breaking. Also show a small "Demo mode" hint in the popover when enabled without key.
   - Traffic: Google Maps traffic requires the JS SDK, not a raster tile URL — leave a `TODO` comment + stub tile layer. Toggle state is preserved for when the SDK is wired later.
5. Both overlay layers use `opacity={0.6}` and `zIndex={400}` so they sit above base tiles but under markers/polylines.
6. Control menu stays visible in both inline and expanded modes.

### Notes
- No new dependencies; `Switch` already exists in the shadcn library.
- No backend/env changes. Actual OpenWeatherMap/Google Traffic wiring is deferred until the user provides keys — the plan explicitly leaves placeholder hooks.
- No changes to routing, geocoding, or marker logic.
