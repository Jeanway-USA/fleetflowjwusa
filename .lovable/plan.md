

## Plan: Virtualize DataTable with @tanstack/react-virtual

### Context
All dispatcher realtime channel subscriptions already have proper `removeChannel()` cleanup in their `useEffect` return functions. No changes needed there.

### DataTable Virtualization

**File: `src/components/shared/DataTable.tsx`**

Replace the current `<TableBody>` rendering (which maps all rows into DOM) with a virtualized approach:

1. Add a `useRef` for the scrollable container div
2. Use `useVirtualizer` from `@tanstack/react-virtual` (already installed) with:
   - `count: data.length`
   - `estimateSize: () => 48` (matches current row height from `p-4` padding)
   - `getScrollElement` pointing to the container ref
   - `overscan: 15` for smooth scrolling
3. Wrap the table in a fixed-height scrollable container (`max-h-[600px] overflow-auto`)
4. Render only virtual rows: use `getTotalSize()` for a spacer `<tbody>` height, then absolutely position visible rows via `translateY`
5. Use `<table>` with `table-layout: fixed` and sticky header for consistent column widths during scroll

**Key structure:**
```text
<div ref={scrollRef} style={{ maxHeight: 600, overflow: 'auto' }}>
  <table style={{ tableLayout: 'fixed' }}>
    <thead> (sticky) ... </thead>
    <tbody style={{ height: totalSize, position: 'relative' }}>
      {virtualRows.map(vRow => (
        <tr style={{ transform: `translateY(${vRow.start}px)`, position: 'absolute' }}>
          ...cells...
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

The loading skeleton, empty state, and CSV export remain unchanged. The API surface (`DataTableProps`) stays identical — this is a purely internal rendering optimization.

### Files

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Edit — add virtualization |

No other files change. No new dependencies needed (`@tanstack/react-virtual` is already installed).

