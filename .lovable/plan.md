

## Fix Special Instructions Scrolling

### Problem
The `ScrollArea` component from Radix does not activate scrolling when only `max-h-40` is applied to its root. The Radix `Viewport` inside uses `h-full w-full`, which doesn't create the overflow needed to trigger the scrollbar. The text gets clipped and the "Scroll for more" hint is misleading.

### Solution
Replace the Radix `ScrollArea` with a plain `div` using `max-h-40 overflow-y-auto`. This is the simplest, most reliable way to get native scrolling on both mobile and desktop. The styled Radix scrollbar is unnecessary here since the content is inside a small box and native scrollbars work fine.

### Changes

**File 1: `src/components/driver/ActiveLoadCard.tsx`**
- Replace `<ScrollArea className="max-h-40">` with `<div className="max-h-40 overflow-y-auto pr-3">`
- Remove the inner `<div className="pr-3">` wrapper (padding moves to the scrollable div)

**File 2: `src/components/driver/DriverLoadsView.tsx`**
- Same replacement: `ScrollArea` to `<div className="max-h-40 overflow-y-auto pr-3">`
- Remove the `ScrollArea` import if no longer used elsewhere in the file

Both files keep the "Scroll for more" indicator and the warning-styled container unchanged.

