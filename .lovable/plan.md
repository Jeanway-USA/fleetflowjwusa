## Plan: Restore the In-Transit Map

### Goal
Make the Dispatcher Dashboard In-Transit map visibly render again, while preserving Mapbox traffic, RainViewer radar, truck clustering, route markers, and forecast sidebar behavior.

### What I found
- Mapbox network tile requests are succeeding, so the public token and CSP are not the main blocker.
- The map component currently delays all operational layers until an `idle` event after `style.load`.
- The visible state is a black map area with only the overlay controls, which points to the Mapbox canvas/style lifecycle not becoming usable or not resizing/painting correctly inside the current container.

### Implementation Steps
1. **Harden Mapbox initialization**
   - Add explicit `load`, `style.load`, `idle`, and `resize` handling.
   - Call `map.resize()` after mount and after the container/layout settles so Mapbox paints into the visible card.
   - Track a `mapLoaded`/`styleReady` state that cannot remain stuck waiting for `idle`.

2. **Use a safer base style fallback**
   - Keep Mapbox navigation styles when they load correctly.
   - Add fallback behavior to switch to a stable Mapbox streets/light or dark style if the navigation style fails or does not become ready.

3. **Move custom layer setup behind reliable readiness checks**
   - Ensure traffic, radar, routes, points, and truck layers only run after the style is actually loaded.
   - Guard every `addSource`/`addLayer` call from running during style swaps.

4. **Improve visible failure states**
   - If Mapbox throws an actual map-load error, show a clear message inside the map area instead of leaving a black panel.
   - Keep noisy RainViewer tile misses filtered so weather tile gaps do not blank the map.

5. **Verify in the live preview**
   - Open `/dispatcher-dashboard` with Playwright.
   - Confirm the base map is visible under the overlay widget.
   - Check the console for remaining Mapbox errors and confirm at least one route/point/truck layer can render when data is present.