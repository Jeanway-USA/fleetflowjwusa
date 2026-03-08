

## Add Row Selection to DataTable

### Changes — `src/components/shared/DataTable.tsx`

**New props on `DataTableProps<T>`:**
- `selectable?: boolean` — opt-in flag to enable selection column
- `selectedIds?: Set<string>` — controlled selection state (kept external so parents can use it)
- `onSelectionChange?: (selectedIds: Set<string>) => void` — callback when selection changes
- `bulkActions?: (selectedIds: Set<string>) => React.ReactNode` — render prop for the floating action bar buttons

**Selection column:**
- When `selectable` is true, prepend a narrow checkbox column (width ~40px) before all visible columns
- Header: `<Checkbox>` that is checked when all visible rows are selected, indeterminate when some are selected
- Body: `<Checkbox>` per row, checked if `selectedIds.has(item.id)`
- Clicking a checkbox calls `onSelectionChange` with the updated Set
- Checkbox click stops propagation so it doesn't trigger `onRowClick`

**Floating action bar:**
- Rendered inside the table container div (below the scrollable area), only when `selectedIds.size > 0`
- Styled as a sticky bottom bar: `absolute bottom-0` with background, border-top, padding
- Left side: "{X} rows selected" + "Clear selection" button
- Right side: `bulkActions(selectedIds)` render prop output

**Implementation details:**
- Selection state is managed externally by the parent (controlled component pattern) — this keeps DataTable stateless regarding selection
- The master "select all" checkbox toggles all `data` items (not just visible virtual rows)
- The checkbox column is excluded from column visibility dropdown and CSV export
- Selected rows get a subtle `bg-primary/5` highlight

### Files Modified
| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Add selectable prop, checkbox column, floating action bar |

