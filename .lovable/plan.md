

## Fix: Vertical Text Centering in DataTable Rows

### Problem
The virtualized table rows have a fixed pixel height (48px standard / 32px compact) set via inline styles, but the `td` cells don't inherit this height. While `align-middle` is set, it has no effect because the cells don't fill the full row height — the content just sits at the top.

### Solution

**File: `src/components/shared/DataTable.tsx`**

Add `height: inherit` to each `td` element so it fills the row's fixed height, allowing `vertical-align: middle` to work correctly. This can be done by adding `style={{ height: 'inherit' }}` to the `<td>` elements in the data rows, or alternatively adding `h-full` class.

Specifically:
- Line 276: Add `style={{ height: 'inherit' }}` to the `<td>` in the virtualized row renderer
- Line 242: Same for `<th>` elements to ensure header text is also centered

This is a minimal two-line change that fixes vertical centering for both density modes.

### Files

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Edit — add `height: inherit` to td/th elements |

