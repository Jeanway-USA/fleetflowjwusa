

## Plan: Fix Dialog Scroll Issues — Header and Close Button

### Problems
1. The close button (`X`) is positioned `absolute` inside the scrollable `DialogContent`, so it scrolls away with content
2. The sticky `DialogHeader` negative margins don't fully prevent content from bleeding above it when scrolling

### Fix (1 file: `src/components/ui/dialog.tsx`)

**DialogContent**: Change from scrolling the entire content to using a flex layout with a separate scrollable body area. Remove `overflow-y-auto` from the outer container and keep it as a flex column.

**Close button**: Move it to be `sticky` (or fixed relative to the dialog) by placing it at a higher z-index within the header area, not inside the scrollable zone.

Concrete approach — restructure `DialogContent` to:
- Remove `overflow-y-auto` and `gap-4` from the outer `DialogPrimitive.Content`
- Wrap `{children}` in a scrollable `div` with `overflow-y-auto flex-1`
- Keep the close button `absolute` but with a higher `z-index` (z-20) so it sits above the sticky header
- Update `DialogHeader` to use `z-20` to stay above scrolling content and ensure no bleed-through

This is a global dialog component change, so all dialogs benefit.

### Files
- `src/components/ui/dialog.tsx` — restructure scroll container and z-index layering

