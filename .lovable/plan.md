## Problem

The route lines drawn for active loads are only visible when zoomed in very closely. On the regional/national view, they nearly disappear against the dark basemap.

Cause: `load-routes-lyr` uses a fixed line width (3.5px normal, 6px selected) with no zoom interpolation and no contrast casing, so at low zooms the thin polylines get lost among road tiles.

## Fix

Edit `src/components/dispatcher/FleetMapView.tsx` (route layer setup around lines 932–977):

1. **Zoom-interpolated width** on `load-routes-lyr` so routes stay legible when zoomed out:
   - unselected: ~3px at zoom 3 → 4px at 6 → 6px at 10 → 8px at 14
   - selected: ~1.5x wider at each stop
2. **Add a casing layer** (`load-routes-casing-lyr`) rendered beneath the colored line — a darker/lighter halo 2–3px wider than the main line — so routes read clearly over both dark and light basemaps.
3. Bump base `line-opacity` from 0.9 to 1.0 for the main line; casing at ~0.6.
4. Insert both layers below symbol layers (labels) so city/road names remain readable on top.

Also apply the same `setPaintProperty` updates to the casing layer when `selectedLoadId` / `overlays.traffic` change.

No changes to routing data, edge function, or truck markers — purely presentation.

### Technical detail

```ts
const widthExpr = [
  'interpolate', ['linear'], ['zoom'],
  3, ['case', ['==', ['get','loadId'], selectedLoadId ?? ''], 4, 2.5],
  6, ['case', ['==', ['get','loadId'], selectedLoadId ?? ''], 6, 4],
  10, ['case', ['==', ['get','loadId'], selectedLoadId ?? ''], 9, 6],
  14, ['case', ['==', ['get','loadId'], selectedLoadId ?? ''], 12, 8],
];
```

Casing uses the same expression + 3 and a fixed color (`#0f172a` or `#ffffff` depending on basemap — start with `#0b1220` since the current basemap is dark).
