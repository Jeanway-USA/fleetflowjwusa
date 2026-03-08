

## Widen Origin & Destination Columns

### Problem
The Origin and Destination columns use `truncate max-w-[200px]` which cuts off text with ellipsis. Additionally, the entire DataTable uses `tableLayout: 'fixed'` which distributes column widths equally regardless of content.

### Changes

**1. `src/pages/FleetLoads.tsx`** — Remove truncation from Origin/Destination renders
- Lines 583, 591: Remove `truncate max-w-[200px]` class from the wrapper divs so full city/state text is visible

**2. `src/components/shared/DataTable.tsx`** — Support column widths + switch to auto layout
- Add optional `width` property to the `Column` interface (e.g., `width?: string`)
- Apply `style={{ width: col.width }}` to `<th>` and `<td>` elements when specified
- Change `tableLayout: 'fixed'` to `tableLayout: 'auto'` so columns size based on content, giving Origin/Destination more room while narrower columns (Date, Status, Actions) shrink naturally

This lets all tables auto-size columns to content, and individual pages can override with explicit widths if needed.

### Files
| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Add `width` to Column interface, apply to th/td, switch to auto table layout |
| `src/pages/FleetLoads.tsx` | Remove `truncate max-w-[200px]` from Origin/Destination renders |

