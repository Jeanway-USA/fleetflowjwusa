# Dispatch Board — Timeline + Unassigned Loads Drawer

Rebuild the Dispatch Board tab so the 14-day Fleet Timeline is the focus and the "Quick Assign" concept becomes a dedicated Unassigned Loads panel with drag-and-drop into driver rows.

## Layout

```text
Dispatch Board Tab
┌──────────────────────────────────────────────────┬───────────────┐
│                                                  │ Unassigned    │
│   FleetTimelineScheduler (14-day grid)           │ Loads         │
│   - Driver rows                                  │  ┌──────────┐ │
│   - Colored load bars span pickup → delivery     │  │ Load #   │ │
│   - Hometime stripes / outbound planning chips   │  │ Origin → │ │
│   - Drop targets = driver day-cells              │  │ Dest     │ │
│                                                  │  │ 📅 M/D   │ │
│                                                  │  └──────────┘ │
│                                                  │  ...          │
└──────────────────────────────────────────────────┴───────────────┘
        (lg: 3-col span)                             (lg: 1-col)

On < lg screens: panel collapses into a bottom drawer/sheet
toggled by a "Unassigned Loads (N)" button.
```

Below the timeline row, `ActiveLoadsBoard` continues to live in this tab (kept from prior step).

## Changes

### 1. New: `src/components/dispatcher/UnassignedLoadsDrawer.tsx`

- Fetches unassigned loads with the same query key `['timeline-unassigned-loads']` so it stays in sync with the timeline's cache invalidations.
- Renders each load as a draggable card showing: Load ID (or `landstar_load_id`), Origin, Destination, and expected Pickup Date (badge).
- Cards use native HTML5 drag-and-drop: `onDragStart` sets `e.dataTransfer.setData('application/x-load-id', load.id)` plus a JSON blob with the full load (so the timeline can compute conflicts without a refetch round-trip).
- Two render modes controlled by a `useIsMobile()` check:
  - **Desktop (lg+)**: static right-hand side panel (`Card`, sticky, scrollable list, height matches timeline).
  - **Mobile / tablet**: floating "Unassigned Loads (N)" button that opens a shadcn `Sheet` from the bottom containing the same list.

### 2. Refactor: `src/components/dispatcher/FleetTimelineScheduler.tsx`

- Add optional prop `hideUnassignedTray?: boolean` (default false, preserves existing behavior for any other consumer).
- When true, do not render the internal "Unassigned Loads Tray" at the bottom of the card.
- Update drop handlers so that when `draggedLoad` local state is empty (drag originated outside the component), read `application/x-load-id` + JSON payload from `e.dataTransfer` and run the same `checkConflicts` + assignment flow.
- No visual/behavior change to load bars, hometime cells, outbound planning chips, PM conflict checks — these already satisfy "colored block spanning estimated transit days".

### 3. Update: `src/pages/DispatcherDashboard.tsx` — Dispatch Board tab only

Replace the current stacked structure:

```
DriverAssignmentPanel
FleetTimelineScheduler
ActiveLoadsBoard
```

with:

```tsx
<div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
  <div className="lg:col-span-3">
    <FleetTimelineScheduler hideUnassignedTray />
  </div>
  <div className="lg:col-span-1">
    <UnassignedLoadsDrawer />
  </div>
</div>
<ActiveLoadsBoard />
```

- `DriverAssignmentPanel` is no longer rendered here (its role is fully absorbed by `UnassignedLoadsDrawer` + the timeline's driver-row drop targets). The component file remains in the repo, unused, so it can be re-instated later if desired.
- The `#assign-driver` scroll anchor moves to the new drawer wrapper so command-palette navigation still works.

### 4. Cache invalidation

`UnassignedLoadsDrawer` shares the query key `timeline-unassigned-loads` used by `FleetTimelineScheduler`. After any drop, the timeline already invalidates `timeline-unassigned-loads` + `timeline-assigned-loads` + `dispatcher-stats` + `active-loads-dispatcher`, so both panels refresh automatically.

## Files Touched

- **New**: `src/components/dispatcher/UnassignedLoadsDrawer.tsx`
- **Edit**: `src/components/dispatcher/FleetTimelineScheduler.tsx` — add `hideUnassignedTray` prop + dataTransfer fallback in drop handler
- **Edit**: `src/pages/DispatcherDashboard.tsx` — restructure Dispatch Board tab

## Out of Scope

- `DriverAssignmentPanel.tsx` is left untouched on disk (per "do not delete the existing child components").
- No DB schema changes, no new npm packages (uses native HTML5 DnD already in use).
- The visual "colored block spanning transit days" rendering is already implemented in `FleetTimelineScheduler` and is unchanged.
