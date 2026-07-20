## Goal
Fix the "Map Overlays" widget in the Command Center so it stays strictly inside the In Transit map container and no longer clips over the global top navigation bar.

## Verified current state
- `src/components/dispatcher/FleetMapView.tsx` renders the map and overlay inside `renderMapContent`, which returns a plain `<div>`.
- The overlay panel uses `absolute top-2 right-12 z-[500]` (or `right-2` when expanded).
- `src/components/shared/ExpandableMap.tsx` wraps the rendered map in `relative group`, but the map's own root `<div>` lacks `relative` / `overflow-hidden`, allowing the overlay to escape its visual bounds.
- The `z-[500]` value is higher than the global page header / nav z-index, causing the clipping issue.

## Changes to make
1. In `src/components/dispatcher/FleetMapView.tsx`:
   - Add `relative overflow-hidden` to the root `<div>` returned by `renderMapContent` so the overlay is clipped to the map container.
   - Change the overlay panel classes from `absolute top-2 ... z-[500]` to `absolute top-4 right-4 z-10` (keeping the `isExpanded` right offset if still needed, but lowering z-index and tightening inset).
   - Ensure the panel still renders above the Leaflet tiles but below the global header and navigation menus.

## Verification
- Build the project and visually confirm the overlay sits inside the map card in both inline and expanded map views.
- Scroll the Dispatcher Dashboard so the map is near the top navigation; confirm the overlay no longer overlaps the nav bar.