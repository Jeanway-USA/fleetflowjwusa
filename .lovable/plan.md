## Goal
Make the Command Center map's "Weather Radar" and "Traffic Conditions" toggles render real Leaflet layers on top of the existing OSM base — without ever reloading the base tiles.

## Changes (single file: `src/components/dispatcher/FleetMapView.tsx`)

### 1. Weather Radar — RainViewer live tile layer
- Remove the OpenWeatherMap key gate and `WEATHER_TILE_URL` constant.
- Add a `useQuery` (or lightweight `useEffect`) that fetches `https://api.rainviewer.com/public/weather-maps.json` when `weatherEnabled` flips on, caches the response, and picks the most recent frame from `radar.past` (`frames[frames.length-1].path`). Refetch every ~5 min.
- Store the frame path in state; when present and `weatherEnabled` is true, render a `<TileLayer>` with:
  - `url = https://tilecache.rainviewer.com/{path}/256/{z}/{x}/{y}/2/1_1.png`
  - `opacity={0.6}`, `zIndex={400}`, `attribution="© RainViewer"`
- Because it's declared inside `<MapContainer>` and only mounts/unmounts based on the toggle, react-leaflet adds/removes the layer without touching the OSM base tile layer.

### 2. Traffic Conditions — mocked polylines
- Define a static `MOCK_TRAFFIC_SEGMENTS` array (module-scope const) with 4–6 major US interstate segments as `{ id, name, severity: 'heavy' | 'moderate' | 'light', coords: [lat,lng][] }`. Examples:
  - I-95 NYC → Philadelphia (heavy, red)
  - I-10 Houston → San Antonio (moderate, amber)
  - I-405 LA loop (heavy, red)
  - I-90 Chicago → Cleveland (moderate, amber)
  - I-75 Atlanta → Chattanooga (light, green)
- Severity → color map: `heavy = #dc2626`, `moderate = #f59e0b`, `light = #16a34a`.
- When `trafficEnabled` is true, render one `<Polyline>` per segment inside the MapContainer with `weight={5}`, `opacity={0.75}`, and a `<Popup>` showing the interstate name + severity label.

### 3. Layer management
- Rendering is done conditionally inside `<MapContainer>` (`{weatherEnabled && rainviewerPath && <TileLayer …/>}` and `{trafficEnabled && MOCK_TRAFFIC_SEGMENTS.map(...)}`), so react-leaflet mounts/unmounts only those layers — the base OSM `<TileLayer>` stays mounted and never reloads.
- Keep the existing overlay control panel UI and `localStorage` persistence exactly as they are.
- Remove the "Demo mode — provider key not yet configured" banner (no longer applicable; both layers now work out of the box).

## Technical notes
- All new logic lives in the presentation component; no schema, hooks, or backend changes.
- RainViewer is a free public API — no key, no secret needed.
- The mocked traffic layer is intentionally static; if we later want a real feed we can swap the polyline source for a fetch without touching the layer-toggle machinery.
