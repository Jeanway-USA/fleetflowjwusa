

## Fix: Trucks page table columns misaligned

### Root Cause

The `DataTable` component's virtualization breaks the native table column alignment. The `<tbody>` is set to `display: block` (required for virtualized absolute-positioned rows), but the `<thead>` remains in normal table display mode. Since they no longer share the same table layout context, the header columns and body columns render at completely different widths, causing the overlapping/compressed appearance seen in the screenshot.

### Fix

**File: `src/components/shared/DataTable.tsx`**

Add matching display styles to the `<thead>` so it renders as a table with the same fixed layout as each virtualized row:

1. On the `<thead>` element, add inline styles: `display: block`
2. On the header `<tr>`, add inline styles: `display: table`, `tableLayout: fixed`, `width: 100%`

This mirrors exactly what each body `<tr>` already does, ensuring columns align perfectly.

### Files

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Edit lines 113-114 — add display styles to thead and header tr |

