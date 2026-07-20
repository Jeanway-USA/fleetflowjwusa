## Problem

The Weather Radar toggle in `FleetMapView.tsx` gets stuck on "Loading radar frames…". Root cause: the fetch stores `${host}${latest.path}` in state, and then the `<TileLayer>` prepends `https://tilecache.rainviewer.com` again — producing a malformed URL like `https://tilecache.rainviewer.com https://tilecache.rainviewer.com/v2/radar/.../256/...`. Tiles never render, and there's no explicit loading/error state, so the UI stays on the placeholder forever.

## Fix (single file: `src/components/dispatcher/FleetMapView.tsx`)

1. **Replace `rainviewerPath` state with a fully-built `radarTileUrl` string** and a `radarLoading` boolean.
2. **Rewrite the RainViewer effect** to use `try / catch / finally`:
   - `try`: fetch `https://api.rainviewer.com/public/weather-maps.json`, then
     ```ts
     const host = data.host;
     const latestFrame = data.radar.past[data.radar.past.length - 1];
     setRadarTileUrl(`${host}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`);
     ```
   - `catch`: `toast.error("Weather radar is temporarily unavailable")` and clear the URL.
   - `finally`: `setRadarLoading(false)` so the UI never hangs.
   - Keep the 5-minute refresh interval and the cancelled-flag guard.
3. **Update the `<TileLayer>`** to consume `radarTileUrl` directly (no extra host prefix) with `opacity={0.5}`.
4. **Update the overlay status text** to show "Loading radar frames…" only while `radarLoading === true`, and hide it once the URL is set or the fetch fails.
5. When the toggle flips off, clear `radarTileUrl` and reset `radarLoading` so a re-enable shows the loading state briefly, then the fresh tiles.

No other files change. Traffic overlay logic is untouched.