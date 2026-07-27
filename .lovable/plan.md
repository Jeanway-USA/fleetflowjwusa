## Problem

On the Dispatch Board tab, `UpcomingPickups` is rendered inside the narrow right-hand sidebar column (1/4 width), but the component still uses a wide 3-column grid card layout built for a full-width row. That's why the card is squeezed: origin truncates to "Set Ep...", the pickup time wraps onto three lines with stray parentheses, and the driver/truck row breaks awkwardly.

Separately, the Fleet Timeline only renders two driver rows, so the left 3/4 column ends around 300px tall while the sidebar continues — leaving a large empty region below the timeline. `ActiveLoadsBoard` currently sits far below, under the fold.

## Changes

### 1. Upcoming Pickups — compact sidebar layout (`src/components/dispatcher/UpcomingPickups.tsx`)

Presentation only; the query stays as is.

- Replace the `grid md:grid-cols-2 lg:grid-cols-3` with a single-column vertical list (`space-y-2`) with a `max-h-[320px] overflow-y-auto` scroll region, matching the Unassigned Loads card.
- Restructure each row for narrow width:
  - Line 1: load number (left) + relative time chip ("in 2 days") right-aligned.
  - Line 2: origin → destination with pin icons, each `truncate` on its own line (same two-line origin/destination pattern used by `UnassignedLoadsDrawer`), and a `title` attribute so the full text shows on hover.
  - Line 3: absolute stop time via `StopTime` — no wrapping parentheses; render as plain muted text next to the `TimeTypeBadge`, with `flex-wrap` and smaller text.
  - Line 4: driver + truck, `min-w-0 truncate`, only shown when the card isn't in "Needs Assignment" state where the badge already occupies space.
- Move the "Needs Assignment" indicator to a small dot/icon instead of a full-width badge so it doesn't force wrapping in a narrow column.
- Header: keep title + "View All", but let the header wrap (`flex-wrap gap-2`) and shrink the button to `size="sm"` with tighter padding.

### 2. Dispatch Board layout (`src/pages/DispatcherDashboard.tsx`)

Rearrange so the empty area is used:

```text
┌───────────────────────────────┬──────────────┐
│ Fleet Timeline (lg:col-span-3)│ Unassigned   │
├───────────────────────────────┤ Loads        │
│ Active Loads Board            │──────────────│
│ (lg:col-span-3)               │ Upcoming     │
│                               │ Pickups      │
└───────────────────────────────┴──────────────┘
```

- Keep the existing `grid lg:grid-cols-4` wrapper, but place both the timeline and `ActiveLoadsBoard` inside the `lg:col-span-3` column stacked with `space-y-6`, so Active Loads fills the blank space directly under the timeline.
- The sidebar (`lg:col-span-1`) keeps the "Planning & Scheduling" heading, Unassigned Loads, and Upcoming Pickups.
- Remove the now-duplicate standalone `ActiveLoadsBoard` block below the grid; the `data-tour="active-loads"` attribute moves with it so the product tour still targets it.
- Remove the `lg:sticky lg:top-4` on the Unassigned Loads card (or keep it on the sidebar wrapper) so the two sidebar cards stack naturally next to the taller left column.

## Technical notes

- No database or query changes; `UpcomingPickups` keeps its existing 48-hour window query and `StopTime` / `TimeTypeBadge` usage per the appointment-time display contract.
- Mobile stays single-column since the grid collapses at `lg` breakpoints; the sidebar renders below the timeline as it does today.
