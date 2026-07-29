## Root cause (reproduced)

I loaded the dispatcher map with the radar toggle on and captured the browser console. Every radar tile is blocked:

```text
Refused to connect to 'https://tilecache.rainviewer.com/v2/radar/e6394e8720de/256/4/3/5/4/1_1.png'
because it violates the following Content Security Policy directive: "connect-src 'self' ..."
Fetch API cannot load ... Refused to connect because it violates the document's Content Security Policy.
```

Zero tiles reach the network (0 responses from `tilecache.rainviewer.com`), so the radar layer is added but renders nothing.

Why: the CSP in `index.html` lists `https://tilecache.rainviewer.com` under **`img-src`** only. That was correct with the old Leaflet map, which loaded tiles as `<img>` elements. Mapbox GL JS fetches raster tiles with the **Fetch API** instead, so the tile host must also be in **`connect-src`** — where it is missing. The index call (`api.rainviewer.com`) is already allowed in `connect-src`, which is why the frame list loads fine and no "temporarily unavailable" toast appears; only the tiles fail.

## Fix

**`index.html`** — add `https://tilecache.rainviewer.com` to the `connect-src` directive (keeping it in `img-src` for any non-Mapbox usage). No other directive changes.

That is the entire functional fix; the existing `applyRadar` layer logic in `FleetMapView.tsx` already works once tiles are permitted.

## Verification

- Reload the dispatcher dashboard with Weather Radar on and confirm `tilecache.rainviewer.com` tiles return HTTP 200 with no CSP console errors.
- Screenshot the map to confirm the radar raster renders beneath the route and truck layers at the configured opacity.
