## Problem

RainViewer's public radar tiles only exist up to zoom level 7. I verified this directly against the live tile API: at z2–z7 the tiles return real radar imagery (4–16 KB PNGs), while at z8 and above every request returns the same 1,370-byte placeholder image that reads "Zoom Level Not Supported".

The map's radar raster source in `src/components/dispatcher/FleetMapView.tsx` is added with no zoom bounds, so when the dispatcher zooms past z7 Mapbox keeps requesting deeper tiles and paints those placeholder graphics across the map — exactly what the screenshot shows.

## Fix

In the radar layer effect in `FleetMapView.tsx`, add zoom bounds to the raster source when it is created:

- `minzoom: 0`, `maxzoom: 7` on the `rainviewer-src` raster source.

With `maxzoom` set, Mapbox stops requesting tiles beyond z7 and instead stretches (overzooms) the last real radar tile, so the precipitation layer stays visible and correctly positioned at any zoom level, just progressively softer as you zoom in — the standard behavior for low-resolution weather overlays.

## Details

- Only the source definition changes; the layer, opacity handling, `beforeId` ordering, and the idle/styledata re-attach logic stay as they are.
- No CSP, edge function, or database changes needed.

## Verification

Load the Dispatcher Dashboard with Weather Radar on, zoom in past the northeast route to z10+, and confirm: no "Zoom Level Not Supported" blocks, radar coverage still drawn, and no radar tile requests above z7 in the network log.
