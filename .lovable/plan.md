

## Fix: Tooltip Clipping Inside DataTable Overflow Container

### Problem
The DataTable container uses `overflow-auto` with a `maxHeight` of 600px. Since `TooltipContent` renders inside this container by default, it gets clipped at the container boundaries — whether top or bottom.

### Fix

**`src/components/ui/tooltip.tsx`** — Wrap `TooltipPrimitive.Content` in a `TooltipPrimitive.Portal` so it renders at the document body level, outside any overflow-clipping ancestor.

```tsx
<TooltipPrimitive.Portal>
  <TooltipPrimitive.Content ... />
</TooltipPrimitive.Portal>
```

Single-line wrapper addition. No other files need changes.

