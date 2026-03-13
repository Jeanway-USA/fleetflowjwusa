

## Plan: Fix Dialog Close Button and Header/Footer Layout

### Problems
1. Close button is `absolute` inside the flex container but gets clipped by the scrollable area's overflow
2. DialogHeader/Footer have complex negative margin hacks that cause padding issues

### Fix (`src/components/ui/dialog.tsx`)

Restructure so the close button is outside the scroll container and always visible. Remove the negative margin approach from header/footer entirely — they should just be normal flex children that don't scroll.

**New structure:**
```
DialogPrimitive.Content (flex col, max-h-85vh, overflow-hidden)
  ├─ Close button (absolute, right-4 top-4, z-30 — relative to Content, not scroll area)
  ├─ {children} in scrollable div (flex-1, overflow-y-auto, px-4 py-4)
```

**Key changes:**
- Add `overflow-hidden` to `DialogPrimitive.Content` so the close button doesn't get clipped by child overflow
- Keep close button `absolute` with `z-30` on the Content (which has `overflow-hidden`, not `overflow-y-auto`)
- **DialogHeader**: Remove all negative margins and sticky positioning. Simplify to just `flex flex-col space-y-1.5 text-center sm:text-left pb-4 border-b border-border`
- **DialogFooter**: Remove all negative margins and sticky positioning. Simplify to just `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t border-border`
- The scrollable div keeps `px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4`

This way header/footer are just regular elements inside the scroll area with no margin hacks, and the close button sits above everything.

### Files
- `src/components/ui/dialog.tsx`

