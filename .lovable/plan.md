

## Make Special Instructions Scrollable

### Problem
The special instructions text in the Load Details dialog gets cut off on mobile screens. While there is a `ScrollArea` with `max-h-64` in the ActiveLoadCard dialog, the dialog's own scroll (`max-h-[90vh] overflow-y-auto`) competes with it, preventing the inner scroll from activating properly. The DriverLoadsView dialog uses a basic `max-h-32` which is too small.

### Changes

**File 1: `src/components/driver/ActiveLoadCard.tsx`**
- Change the special instructions `ScrollArea` from `max-h-64` to `max-h-40` so it activates sooner within the dialog's viewport
- Add a visible scroll indicator style so users know the content is scrollable

**File 2: `src/components/driver/DriverLoadsView.tsx`**
- Replace the plain `div` with `max-h-32 overflow-y-auto` with a proper `ScrollArea` component (matching the ActiveLoadCard pattern)
- Add the same warning-styled container and `formatSpecialInstructions` helper used in ActiveLoadCard for consistency
- Set `max-h-40` for the scroll area

### Technical Notes
- Both dialogs already have `max-h-[90vh] overflow-y-auto` on the `DialogContent`, which allows the entire dialog to scroll. The inner `ScrollArea` ensures the special instructions section itself is independently scrollable when it contains long text.
- The `ScrollArea` component from Radix provides a styled scrollbar thumb, making it more visible to users that more content exists below.
