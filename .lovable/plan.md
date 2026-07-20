# Dispatch Board — Auto-Snap Drop + Resizable Load Bars

Scope: `src/components/dispatcher/FleetTimelineScheduler.tsx` only (Dispatch Board tab). UnassignedLoadsDrawer already passes the full load JSON via `dataTransfer`, so no changes needed there.

## 1. Auto-snap on drop

When a load is dropped on a driver row:

- Read `booked_miles` from the dropped load payload (already selected on unassigned queries; if missing, fall back to 1 day).
- Compute `days = max(1, ceil(booked_miles / 500))`.
- Compute dates:
  - `pickup_date` = the calendar day the drop landed on (we can already resolve `dayIdx` from the drop target — add `dayIdx` param to `handleDrop`).
  - `delivery_date` = `addDays(pickup, days - 1)`.
- Run existing `checkConflicts` against the new dates before writing.
- Update `fleet_loads` with `{ driver_id, status: 'assigned', pickup_date, delivery_date }` (was only `driver_id + status`).

Constants: `MILES_PER_DAY = 500` at module top so it's tweakable.

## 2. Resizable load bars

Add two thin drag handles inside each rendered load bar (the block at lines ~496–505):

- Left handle: 4px wide, `cursor-w-resize`, textured with `GripVertical` at low opacity.
- Right handle: mirror on the right edge, `cursor-e-resize`.
- Handles use `onMouseDown` (not HTML5 drag, to avoid clashing with the row's drop target).

Resize interaction (component-level state `resizing: { loadId, edge: 'left'|'right', originX, originPickup, originDelivery } | null`):

1. `mousedown` on a handle: capture pointer, store origin state, `e.stopPropagation()` so the row drag doesn't fire.
2. `window.mousemove`: compute `dxDays = round((clientX - originX) / dayCellWidthPx)`. Measure `dayCellWidthPx` from a ref on any day header cell so it stays accurate at all viewport sizes.
   - Left edge → new `pickup = originPickup + dxDays`, clamped to `≤ delivery` and inside the 14-day window.
   - Right edge → new `delivery = originDelivery + dxDays`, clamped to `≥ pickup`.
   - Update a local `previewDates` state so the bar re-renders live without touching the DB.
3. `window.mouseup`: if dates changed, run `checkConflicts` with the preview dates; on pass, `UPDATE fleet_loads SET pickup_date/delivery_date`. On conflict, toast + revert. Invalidate the same query keys the drop handler uses.

Bar width already derives from `pickup_date`/`delivery_date` — feeding `previewDates` through the same path automatically stretches/compresses the block. No new geometry math.

## 3. Floating date tooltip during resize

- While `resizing` is active, render a fixed-position pill (portal-less, `position: fixed`, follows `mousemove`) styled like existing toasts (`bg-popover text-popover-foreground border rounded px-2 py-1 text-xs shadow-md`).
- Content: `Pickup: Mon, Jan 15` when dragging the left edge, `Delivery: Wed, Jan 17` when dragging the right edge (uses `format(date, 'EEE, MMM d')`).
- Hide on mouseup.

## 4. Edge cases

- Dropping on a day where existing loads already occupy the auto-span window → conflict toast fires (existing logic), no assignment.
- Resizing across hometime days → `checkConflicts` already flags it; revert on release.
- Resize past window edges → clamp visually; no DB write for that edge.
- Touch: handles work with mouse for now; touch resize is out of scope (existing drag-drop is also mouse-only).

## Technical notes

- Files touched: `src/components/dispatcher/FleetTimelineScheduler.tsx` (only).
- No schema change — `booked_miles`, `pickup_date`, `delivery_date` all exist on `fleet_loads`.
- No new dependencies.
