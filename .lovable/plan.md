# Fix Messages Drawer Header Clipping (Local-Only)

## Root cause
The global `SheetHeader` in `src/components/ui/sheet.tsx` bakes in negative offsets and a sticky overlay (`-mx-6 -mt-6 px-6 pt-6 pr-12 sticky top-0 z-10 bg-background`) intended to work with the default `p-6` `SheetContent` padding. The Messages drawers (`DriverChatSheet` and `DriverMessages`) intentionally override `SheetContent` with `p-0 flex flex-col overflow-hidden` to build a header / scroll-body / composer layout. The header's `-mt-6` then pulls it up over the first row of the conversation list, and `-mx-6` makes it bleed beyond the panel — producing the visible overlap with the X close button and first item.

Per the constraint, `src/components/ui/sheet.tsx` will NOT be touched. The fix lives entirely inside the driver messaging components.

## Files to edit (local only)

### 1. `src/components/driver/DriverMessages.tsx`
- Replace the `<SheetHeader>` wrapper with a plain `<div>` acting as a static, in-flow header:
  - Classes: `shrink-0 px-5 pt-5 pb-4 pr-12 border-b border-border bg-background` (the `pr-12` reserves space for the absolute X close button rendered by `SheetContent`; `shrink-0` keeps it out of the flex shrink calculation so the conversation list cannot ride up under it).
- Keep `<SheetTitle>` inside that div for accessibility (Radix requires it inside `SheetContent`).
- Remove the `SheetHeader` import (leave `SheetTitle`).
- Leave the conversation `<ul>` / thread body untouched — its parent already has `flex-1 overflow-y-auto`, which now correctly starts below the static header.

### 2. `src/components/drivers/DriverChatSheet.tsx`
Same change: swap `<SheetHeader>` for a `<div className="shrink-0 px-5 pt-5 pb-4 pr-12 border-b border-border bg-background">` containing the existing avatar + `SheetTitle` markup. Drop the `SheetHeader` import.

## What stays the same
- `src/components/ui/sheet.tsx` and every other consumer of `SheetHeader` are untouched.
- `SheetContent` still owns the absolute X close button and the outer flex column.
- The message list still scrolls independently; the composer stays pinned at the bottom.

## Validation
1. Open the Drivers page → click message on a driver row → `DriverChatSheet` opens. Header sits flush at the top, X button is fully clickable, first message and avatar are 100% visible, conversation scrolls under a static header, composer pinned at bottom.
2. From the Driver Dashboard top bar → open Messages icon → `DriverMessages` opens. The first conversation row in the list is fully visible (not clipped by the header), list scrolls cleanly, opening a thread keeps the same correct layout.
3. Spot-check one unrelated sheet (e.g. `NewWorkOrderSheet`, `AuditLogDetailSheet`) to confirm nothing regressed — they still use the global `SheetHeader` with default `SheetContent` padding.
