

## Plan: Add View Density Toggle to DataTable

### Changes

**File: `src/components/shared/DataTable.tsx`**

1. **Density state** — Add `density: 'standard' | 'compact'` state, initialized from `localStorage` key `datatable-density` (default: `'standard'`). Persist on change.

2. **Toggle button** — Add a `Rows3` (or `AlignJustify`) icon button in the toolbar (always visible, not gated by `tableId`). Clicking toggles between standard/compact. Show active state via variant or tooltip.

3. **Dynamic styles** — Derive from density:
   - **Standard**: `ROW_HEIGHT = 48`, th `h-12 px-4 text-sm`, td `p-4 text-sm`
   - **Compact**: `ROW_HEIGHT = 32`, th `h-8 px-3 text-xs`, td `px-3 py-1 text-xs`

4. **Update virtualizer** — Pass the dynamic row height to `estimateSize` so virtualization recalculates correctly. Add `density` to the virtualizer's dependency via `useVirtualizer` key or by recreating when density changes.

5. **Update toolbar visibility** — `hasToolbar` becomes always true (density toggle is always available), or gate it as `exportFilename || tableId || true` effectively.

6. **Loading skeleton** — Also apply compact padding to the loading state cells.

### Files

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Edit — add density state, toggle button, dynamic cell classes, updated virtualizer sizing |

