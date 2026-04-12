

## Remove Vertical Scrollbar from Sheet Inner Wrapper

### Problem
The shared `SheetContent` component wraps children in a div with `overflow-y-auto`, which shows a vertical scrollbar even when content fits without scrolling.

### Fix
Change the inner wrapper's overflow from `overflow-y-auto` to `overflow-y-hidden` is too aggressive (it would break sheets that DO need scrolling). Instead, the best approach is to keep `overflow-y-auto` but hide the scrollbar track visually using Tailwind's `scrollbar-none` utility (or the equivalent CSS). This way sheets that need scrolling still work, but no visible scrollbar appears.

Alternatively, since this is a global primitive, a cleaner solution: keep `overflow-y-auto` and add the `scrollbar-hide` class. Tailwind v3 doesn't have this built-in, so the simplest approach is to add a small CSS utility in `index.css`.

### File changes

**`src/index.css`** — Add a utility class:
```css
/* Hide scrollbar but keep scroll functionality */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

**`src/components/ui/sheet.tsx`** — Line 63, add the utility:
```tsx
// Before
<div className="flex-1 overflow-y-auto overflow-x-hidden p-6">

// After
<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-6">
```

This hides the scrollbar visually on all sheets while preserving scroll functionality for sheets with longer content.

