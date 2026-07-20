## Root cause

The RainViewer fetch fails with `Failed to fetch` because the app's Content Security Policy (in `index.html`) blocks it. The current CSP allows only Supabase, Nominatim, and OSRM for `connect-src`, and only OpenStreetMap/Carto tiles for `img-src`. RainViewer needs both:

- `connect-src` — `https://api.rainviewer.com` (for the JSON index fetch)
- `img-src` — `https://tilecache.rainviewer.com` (for the radar PNG tiles served through `<TileLayer>`)

Because neither is whitelisted, the browser silently blocks the fetch → the catch branch fires → toast shows "temporarily unavailable". The code itself is correct.

## Fix

Edit the CSP `<meta>` in `index.html`:

- Add `https://api.rainviewer.com` to `connect-src`.
- Add `https://tilecache.rainviewer.com` to `img-src`.

No component changes needed — once CSP allows the requests, the existing weather-radar logic renders the RainViewer tiles at 0.5 opacity.