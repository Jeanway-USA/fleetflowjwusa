

## Plan: Interactive Product Tour with Spotlight Overlay

### Approach
Build a custom, zero-dependency tour system using React portals and existing UI primitives (Card, Button, Badge). No external library needed — keeps bundle light and fully matches the existing theme.

### New Files

**`src/components/shared/ProductTour.tsx`** — Core tour component:
- Renders via React portal at `document.body` level
- **Overlay**: Full-screen semi-transparent backdrop (`bg-black/60`) with a CSS `clip-path` cutout that spotlights the target element (calculated via `getBoundingClientRect`)
- **Tooltip card**: Positioned adjacent to the spotlight using absolute positioning, with auto-flip logic (top/bottom/left/right based on viewport space)
- Card contains: step title, description, progress indicator ("Step 1 of N"), Back/Next/Skip buttons
- Uses `ResizeObserver` + scroll listener to reposition on layout changes
- Smooth transitions via CSS `transition-all`

**`src/hooks/useProductTour.ts`** — Tour state hook:
- Manages: `currentStep`, `isActive`, `hasCompleted`
- Persists completion to `localStorage` per tour ID (e.g., `tour_dispatcher_v1`)
- Exposes: `startTour()`, `nextStep()`, `prevStep()`, `skipTour()`, `resetTour()`

**`src/lib/tour-steps.ts`** — Tour step definitions per dashboard:
- Each step: `{ id, targetSelector, title, description, placement? }`
- Dispatcher tour example steps: Sidebar navigation, Active Loads board, Driver Status grid, Fleet Map
- Extensible for other dashboards later

### Modified Files

**`src/components/layout/DashboardLayout.tsx`**:
- Import and render `<ProductTour />` alongside existing overlays (CommandPalette, BetaFeedbackWidget)
- Add a "Take a Tour" button in the header (small ghost button with a `CircleHelp` icon) that calls `startTour()`
- Only show button when tour steps exist for the current route

### Technical Details

- **Spotlight cutout**: Use CSS `clip-path: polygon()` on the overlay div, creating a rectangular hole around the target element with 8px padding and rounded appearance
- **Positioning**: Calculate tooltip placement relative to the cutout, preferring bottom, falling back to top/left/right based on available viewport space
- **Scroll handling**: If target is off-screen, `scrollIntoView({ behavior: 'smooth', block: 'center' })` before spotlighting
- **Keyboard**: Escape to skip, Arrow Right/Left for next/prev
- **Z-index**: Overlay at `z-[9999]`, tooltip at `z-[10000]` — above all existing layers

### Files Summary
| File | Action |
|------|--------|
| `src/hooks/useProductTour.ts` | Create |
| `src/lib/tour-steps.ts` | Create |
| `src/components/shared/ProductTour.tsx` | Create |
| `src/components/layout/DashboardLayout.tsx` | Modify — add tour trigger + render |

