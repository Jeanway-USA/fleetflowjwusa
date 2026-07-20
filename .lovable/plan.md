## Goal

Replace the Leaflet-based dispatcher map with a Mapbox GL JS map that shows real-time traffic, a toggleable weather radar, and a 7-day forecast panel for the selected active load. Match the existing shadcn/Tailwind theme.

## Setup

1. **Mapbox connector** — link via `standard_connectors--connect` (`mapbox`). Uses:
   - `VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN` (browser, `pk.`) for the GL JS map.
   - Server-side Mapbox not needed for this feature.
2. **Dependency** — add `mapbox-gl` (and `@types/mapbox-gl`) via bun.
3. No new secrets: RainViewer and Open-Meteo are keyless. Existing CSP already allows RainViewer; add `api.mapbox.com`, `events.mapbox.com`, and `api.open-meteo.com` to `connect-src`, plus Mapbox tile hosts to `img-src`/`worker-src`/`style-src` in `index.html`.

## Files touched (map-related only)

- `src/components/dispatcher/FleetMapView.tsx` — rewrite around Mapbox GL JS.
- `src/components/dispatcher/MapLegend.tsx` (new) — legend + opacity sliders.
- `src/components/dispatcher/WeatherForecastPanel.tsx` (new) — 7-day sidebar for selected load.
- `src/hooks/useOpenMeteoForecast.ts` (new) — fetch/cached 7-day forecast for a lat/lng.
- `src/hooks/useActiveLoadsForMap.ts` (new) — pulls active loads + last driver location from Supabase (reuses existing views; no schema changes).
- `index.html` — CSP additions above.

Existing hooks (`useActiveLoadRoute`, driver location queries) are reused unchanged.

## Map architecture (Mapbox GL JS)

- Basemap: `mapbox://styles/mapbox/navigation-day-v1` (light) / `navigation-night-v1` (dark, tied to ThemeContext).
- **Traffic layer**: add the Mapbox `mapbox-traffic-v1` vector source and a `line` layer styled by the `congestion` property → green / yellow / orange / red. Toggleable; opacity slider (0–100%).
- **Weather radar**: RainViewer raster tiles added as a `raster` source at 50% default opacity, opacity slider, refresh every 5 min. Keep existing keyless fetch flow with `try/catch/finally` and error toast.
- **Active loads**:
  - Route lines: use `current_route_geometry` from `fleet_loads` (via `useActiveLoadRoute`) as a GeoJSON `line` layer, one feature per active load, styled by status.
  - Pickup/delivery markers as symbol layers with custom SVG icons.
  - Truck positions from `driver_locations` as a clustered symbol layer (cluster ≥ 8 trucks in view). Pulsing dot for live drivers.
- **Filter scope**: traffic layer stays global (Mapbox renders it everywhere), but a "Focus active routes" toggle uses a `line-gradient` mask so congestion coloring only shows within a buffered corridor around active-load geometries + major interstates (I-5, I-10, I-95, I-80 hardcoded as fallback GeoJSON). Implemented via a second faded traffic layer + a highlighted layer clipped by `within` expression.
- **Auto-center**: clicking an active load in the existing dispatcher list (or a truck marker) fits bounds to that load's route with padding.

## UX

- Floating control panel (top-right, `bg-background/90 backdrop-blur border rounded-lg`) with:
  - Toggles: Traffic, Weather Radar, Show Trucks, Focus Active Routes.
  - Opacity sliders for Traffic and Radar (shadcn `Slider`).
  - Legend collapsible section (congestion colors, load-status colors).
- Loading skeletons on the map container until style + first data load resolve.
- Error toast on Mapbox style failure, RainViewer failure, and forecast fetch failure — map stays usable.
- Mobile: control panel collapses to an icon button that opens a Sheet.

## 7-day forecast sidebar (selected load only)

- New `WeatherForecastPanel`, right side of the Command Center map area, only mounted when a load is selected.
- Three tabs: **Pickup**, **Current truck location**, **Delivery**.
- Each tab renders 7 cards (one per day) with:
  - Weekday, Lucide weather icon mapped from Open-Meteo `weather_code`.
  - High/low temp (°F), precipitation probability %, wind mph.
- Data source: `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`.
- TanStack Query, 30-min stale time, per-coordinate cache key.

## Data & performance

- Active-load query: `fleet_loads` where `status in (assigned, loading, in_transit, unloading)` and `deleted_at is null`, joined to latest `driver_locations` row per driver. Realtime channel invalidates on `fleet_loads` and `driver_locations` changes.
- Trucks rendered via Mapbox clustering (`cluster: true, clusterRadius: 50`) so 100+ trucks stay smooth.
- All layers added once on `map.on('load')`; toggles flip `visibility` — no full remount.

## Out of scope

- No incident/construction feed (Mapbox Traffic congestion only; TomTom/511 deferred per your choice).
- No schema changes, no edge functions.
- No changes outside the map component tree and CSP.

## Verification

- Type-check passes (`tsgo` runs automatically).
- Manual check on `/dispatcher-dashboard`: map loads, traffic toggle recolors interstates, radar toggle overlays precipitation, selecting a load auto-centers and populates forecast tabs.
