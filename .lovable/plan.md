

## Plan: DataTable Column Visibility & Save View

### Overview

Enhance the existing custom `DataTable` with a column visibility toggle dropdown and localStorage persistence — without migrating to `@tanstack/react-table` (which would be a large rewrite). The current component uses a simple `Column[]` interface with `@tanstack/react-virtual` for virtualization. We'll add visibility state on top of this.

### Changes

**File: `src/components/shared/DataTable.tsx`**

1. **New prop: `tableId?: string`** — used as the localStorage key. When provided, enables the Save View feature. Consumers pass a unique string like `"trucks"` or `"trailers"`.

2. **Column visibility state** — `useState<Record<string, boolean>>` mapping `col.key` → visible (default all `true`). On mount, if `tableId` is set, read saved state from `localStorage` key `datatable-view-${tableId}`.

3. **"View" dropdown** — Render a `DropdownMenu` button (with `SlidersHorizontal` icon) in the toolbar next to Export CSV. Inside: a `DropdownMenuCheckboxItem` for each column, toggling visibility. At the bottom: a `DropdownMenuSeparator` + "Reset to default" item that restores all columns visible.

4. **Filter visible columns** — Derive `visibleColumns = columns.filter(c => visibility[c.key] !== false)` and use it for rendering the thead, tbody cells, loading skeleton, and CSV export.

5. **Auto-save to localStorage** — `useEffect` that writes `JSON.stringify(columnVisibility)` to localStorage whenever it changes (debounce not needed, it's tiny).

**Consumer updates (no changes required)** — The feature is opt-in via `tableId`. Existing usages without `tableId` behave identically to today.

**Recommended consumer additions (optional, same message):**
- `Trucks.tsx`: add `tableId="trucks"`
- `Trailers.tsx`: add `tableId="trailers"`  
- `Documents.tsx`: add `tableId="documents"`
- `AgencyLoads.tsx`: add `tableId="agency-loads"`

### Files

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Edit — add visibility state, View dropdown, localStorage persistence |
| `src/pages/Trucks.tsx` | Edit — add `tableId="trucks"` prop |
| `src/pages/Trailers.tsx` | Edit — add `tableId="trailers"` prop |
| `src/pages/Documents.tsx` | Edit — add `tableId="documents"` prop |
| `src/pages/AgencyLoads.tsx` | Edit — add `tableId="agency-loads"` prop |

