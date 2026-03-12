

## Plan: Optimize Driver-Facing Components for Mobile

### Changes

**1. `src/components/driver/DVIRForm.tsx`**
- Line 94: Add `text-base` class to odometer Input for larger touch-friendly text on mobile
- Line 101: Remove `max-h-48` on checklist container — let it show all items without scrolling on mobile (`max-h-none sm:max-h-48 sm:overflow-y-auto`), since scrolling inside a scroll is bad UX on phones
- Line 103: Increase `min-h-[44px]` to `min-h-[48px]` for 48px touch targets on checklist items
- Line 168-184: Submit button already `w-full h-12` — good

**2. `src/components/driver/PostTripForm.tsx`**
- Line 424: Photo grid `grid-cols-4` → `grid-cols-2 sm:grid-cols-4` (photos too tiny on phone at 4-col)
- Line 432-439: Increase delete button from `h-5 w-5` to `h-7 w-7` for better touch target
- Line 446-454: "Add Photo" button — change from `size="sm"` to `className="w-full h-12"` for prominent block-level tap target

**3. `src/components/driver/SignaturePad.tsx`**
- Line 108-111: Canvas already has `w-full` and `touch-none` — good for width. Add `aspect-[8/3]` class and remove fixed `height={150}` so it scales proportionally. Use a ResizeObserver to set canvas internal dimensions dynamically.
- Line 122-143: Make buttons `w-full` stacked vertically on mobile: change `flex gap-2` to `flex flex-col sm:flex-row gap-2`, and remove `size="sm"` to use default (larger) size.

**4. `src/components/driver/PhotoCapture.tsx`**
- Line 123: Change button container from `flex gap-2` to `flex flex-col sm:flex-row gap-2` so Take Photo / Gallery stack as full-width blocks on mobile
- Line 127-128: Remove `size="sm"` and add `h-12 w-full` for prominent 48px touch targets
- Line 138-148: Same for Gallery button

### Implementation Details

**SignaturePad canvas resize** — Add a `useEffect` with `ResizeObserver` to dynamically set `canvas.width` based on container width, maintaining a consistent aspect ratio. This prevents blurry signatures on high-DPI mobile screens.

```typescript
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;
  
  const observer = new ResizeObserver((entries) => {
    const { width } = entries[0].contentRect;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = (width * 3 / 8) * (window.devicePixelRatio || 1);
    // Re-init context after resize
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  });
  observer.observe(container);
  return () => observer.disconnect();
}, []);
```

### Files Modified
| File | Change |
|------|--------|
| `DVIRForm.tsx` | Remove nested scroll, increase touch targets |
| `PostTripForm.tsx` | Photo grid 2-col mobile, larger buttons |
| `SignaturePad.tsx` | Dynamic canvas resize, stacked full-width buttons |
| `PhotoCapture.tsx` | Full-width stacked buttons on mobile |

