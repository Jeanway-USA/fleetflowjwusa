

## Fix Table Column Alignment — Header vs Body

### Problem
The DataTable uses virtualization which forces `display: block` on `thead` and `tbody`, with each `tr` set to `display: table; tableLayout: auto`. Since header and body rows are in separate block-level containers, the browser calculates column widths independently for each — causing misalignment between header labels and body content.

### Solution
Switch from `tableLayout: 'auto'` to `tableLayout: 'fixed'` on both the header `tr` and body `tr` elements, and distribute column widths evenly (or based on explicit `width` props). This forces all rows to share the same column sizing.

### Changes — `src/components/shared/DataTable.tsx`

1. Compute a default width per column: `${100 / totalColumns}%` for columns without an explicit `width` prop, accounting for the selection checkbox column (fixed 40px).

2. On the header `<tr>`: change `tableLayout: 'auto'` → `tableLayout: 'fixed'`

3. On each body `<tr>`: change `tableLayout: 'auto'` → `tableLayout: 'fixed'`

4. Apply the computed width to every `<th>` and `<td>` that doesn't already have an explicit `col.width`, ensuring header and body columns share identical sizing.

5. Also apply `tableLayout: 'fixed'` to the loading skeleton table so it stays consistent.

### Files Modified
| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Switch to fixed table layout with computed column widths |

