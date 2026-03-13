

## Plan: Fix Content Tucked Under Sticky Dialog Header

### Problem
The `DialogHeader` is `sticky top-0` *inside* the scrollable `div`, but uses negative margins to try to pull itself flush. When scrolled to the top, the first content item sits at the same scroll position as the header, so it appears tucked underneath it.

### Fix (`src/components/ui/dialog.tsx`)

Move the header and footer *outside* the scrollable area entirely, rather than using sticky positioning inside it. The structure becomes:

```
DialogContent (flex col, max-h-85vh)
  ├─ Close button (absolute, z-20)
  ├─ {children} rendered directly — DialogHeader/Footer are siblings of scrollable content
```

Specifically, restructure `DialogContent` to render children directly (no wrapper div). Then update `DialogHeader` and `DialogFooter` to be non-sticky, non-scrolling flex items. Only the middle content between header and footer scrolls.

Since we can't split children automatically, the better approach is to keep header/footer sticky inside the scroll area but **remove the negative top margin** and instead use a proper approach:

- Keep the scrollable wrapper with padding
- `DialogHeader`: Change from negative margins to `sticky top-0 z-20` with **no negative top margin**. Instead, remove top padding from the scrollable container and let the header provide its own padding. This prevents content from appearing above/behind it.

**Concrete change**: On the scrollable wrapper div, change padding from `p-4 sm:p-6` to `pt-0 px-4 pb-4 sm:px-6 sm:pb-6`. On `DialogHeader`, remove `-mt-4 sm:-mt-6` and `pt-4 sm:pt-6`, replace with `pt-4 sm:pt-6` applied as part of the padding within the scroll container's first element. Actually simplest fix:

- Scrollable div: `p-0` (no padding)
- DialogHeader: Remove all negative margins. Use `px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b sticky top-0 z-20 bg-background rounded-t-lg`
- Body content between header/footer gets padding via the gap or individual elements
- DialogFooter: Similar treatment — `px-4 sm:px-6 pb-4 sm:pb-6 pt-4 border-t sticky bottom-0 z-20 bg-background rounded-b-lg`

This ensures the header is truly flush with the top of the scroll container and content can never appear above it.

### Files
- `src/components/ui/dialog.tsx` — adjust padding/margin strategy for header, footer, and scroll container

