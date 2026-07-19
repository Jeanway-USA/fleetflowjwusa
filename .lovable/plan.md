## Mobile-responsive Fleet Loads table

Scope: give `DataTable` a mobile card view and use it in Fleet Loads. Tablet/desktop layout is unchanged.

### `src/components/shared/DataTable.tsx`

- Add optional prop `renderMobileCard?: (item: T) => React.ReactNode`.
- Below `md` (`<768px`): when `renderMobileCard` is provided, hide the `<table>` (and its sticky header) and render a vertical stack of card `<div>`s inside the same scroll container. Each card:
  - Uses `rounded-lg border border-border bg-card p-3` with `space-y-2`.
  - Fires the same `onRowClick` / `onRowDoubleClick` / `toggleExpand` handlers the table row does, and keeps the row-highlight pulse via `data-row-id`.
  - Shows the selection checkbox and expand chevron inline in a top action row when `selectable` / `expandable` are on.
  - Renders `renderExpanded` in a `border-t pt-2 mt-2` block when the row is expanded.
- Toolbar (search, filters, density, columns, bulk actions) stays visible on mobile so features aren't lost.
- Tablet path unchanged — the existing container is already `overflow-auto`; explicitly add `overflow-x-auto` on the table wrapper so wide tables can scroll horizontally on mid-size screens without wrapping the page.
- When `renderMobileCard` is not provided, mobile behaviour is unchanged (existing `hiddenOnMobile` column hints keep working).

### `src/pages/FleetLoads.tsx`

Pass `renderMobileCard` to the Fleet Loads `DataTable`. Card content (top to bottom):

1. Header row: **Load ID** (reference or short id, `font-semibold`) on the left, `StatusBadge` on the right.
2. Origin block: small uppercase "From" label + `City, ST` + zip line (reuses `formatAddressDisplay`).
3. Destination block: small uppercase "To" label + `City, ST` + zip line.
4. Meta row: rate (`text-success font-medium`) and driver name / "Unassigned" separated with a subtle divider dot.
5. Actions dropdown pinned to the header row's right side beside the status badge.

Everything uses `whitespace-normal break-words` so nothing clips off-screen; card width is 100% of the container. No horizontal scroll needed in card mode.

### Notes

- Uses semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`) — no hardcoded gray classes.
- No schema, no column, no behavior changes; the desktop table and the newly added expand/wrap features stay identical.
- I'll also switch the preview viewport to mobile after building so the change is visible immediately; the user can toggle it back with the device switcher above the preview.

### Out of scope

- Applying `renderMobileCard` to other tables (Agency Loads, Drivers, etc.) — those keep their current `hiddenOnMobile` behaviour until requested.
