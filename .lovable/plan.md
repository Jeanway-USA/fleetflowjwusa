
# Fleet Loads table: wrapping, stacked cells, expandable rows

## Scope

Changes are limited to the Fleet Loads table experience. The shared `DataTable` currently forces every body cell to `whitespace-nowrap` + `truncate` inside fixed-height virtualized rows (from the previous overlap fix). To satisfy this request we need multi-line wrapping and variable row heights, which conflicts with that global rule. So we extend `DataTable` with opt-in features rather than flipping the default and breaking every other table.

## Changes

### 1. `src/components/shared/DataTable.tsx` — opt-in wrapping + expandable rows

Add three new, backward-compatible props:

- `wrapCells?: boolean` — when true, body `<td>` uses `whitespace-normal break-words` and cell content wrapper drops `whitespace-nowrap`/`truncate`. Default false, preserving current single-line clipping everywhere else.
- `expandable?: boolean` and `renderExpanded?: (item: T) => React.ReactNode` — when both provided, prepend a chevron column, track an `expandedIds: Set<string>` in local state, and render an extra `<tr>` beneath any expanded row with a full-width `<td colSpan={...}>` containing `renderExpanded(item)`.
- Per-column `wrap?: boolean` on the `Column<T>` type so specific columns (Origin / Destination) can wrap even when `wrapCells` is false.

Virtualization: switch the row virtualizer to dynamic sizing via `measureElement`, keyed on `virtualRow.index` and the row's expanded state, so wrapped content and the expanded panel push subsequent rows down instead of overlapping. `estimateSize` keeps returning the density row height as the initial guess; actual heights are measured after mount. This only kicks in when `wrapCells` or `expandable` is true — non-Fleet-Loads tables keep the current fixed-height fast path.

Row click behavior: when `expandable` is on and no `onRowClick` is provided, clicking a row toggles its expanded state. If `onRowClick` is provided, expansion is only toggled via the chevron button so existing single-click semantics stay intact.

### 2. `src/pages/FleetLoads.tsx` — column definitions and expanded panel

- Turn on `wrapCells` and `expandable` on the Fleet Loads `<DataTable>`.
- Rewrite Origin and Destination column `render` callbacks to a two-tier stacked cell:

  ```text
  ┌─────────────────────────┐
  │ Grand Prairie, TX       │  ← city, state (font-medium)
  │ 75052                   │  ← zip (text-xs text-muted-foreground)
  └─────────────────────────┘
  ```

  Implemented as `<div class="flex flex-col leading-tight"><span>{city}, {state}</span><span class="text-xs text-muted-foreground">{zip}</span></div>`, with graceful fallback when zip is missing.

- Keep the primary columns visible at all times: Load ID / Reference, Status, Origin, Destination, Pickup Date, Delivery Date, plus the existing actions column.
- Move secondary fields out of the row into `renderExpanded`. The expanded panel is a compact grid of label/value pairs inside a subtle `bg-muted/30` block:
  - Weight, Commodity, Pieces/Dimensions
  - Broker / Carrier / Rate details already captured on the load
  - Notes / special instructions (wraps freely, since it's inside the expanded panel)
- Hide those secondary fields from the collapsed row (either drop them from `columns` or mark them `hiddenOnMobile` → replaced by expansion on all sizes).

### 3. Nothing else changes

- No schema changes, no query changes, no other tables touched.
- Agency Loads, Drivers, Trucks, etc. keep the current single-line clipping until we choose to opt them in later.

## Technical notes

- The dynamic-height branch uses `rowVirtualizer.measureElement` via a `ref` on each rendered `<tr>` and `data-index={virtualRow.index}`. TanStack Virtual handles the recompute; we just need to remeasure when a row expands/collapses (calling `rowVirtualizer.measure()` from the expand toggle, or letting `measureElement` observe via ResizeObserver — the latter is preferred and needs no manual call).
- Expanded panel row is rendered as a sibling virtual item with its own measured height; simplest implementation is to render `<React.Fragment>` per virtual row containing the main `<tr>` and, when expanded, a second `<tr>` — both wrapped in a single positioned container div so the virtualizer measures their combined height.
- `title` tooltips on wrapped cells become unnecessary (full text is visible), but the existing `title` fallback stays for non-wrapped tables.

## Out of scope

- Retrofitting wrap/expand into Agency Loads, Drivers, Trucks, Trailers, etc.
- Column resizing or user-configurable expanded field sets.
- Persisting expanded state across navigations.
