

## Remove Horizontal Scrollbar from Sheet Component

### Problem
The inner scrollable wrapper (`overflow-y-auto`) shows a horizontal scrollbar because `SheetHeader` and `SheetFooter` use negative horizontal margins (`-mx-6`) to stretch beyond their parent's padding, causing horizontal overflow.

### Fix
Add `overflow-x-hidden` to the inner scrollable div so only vertical scrolling is allowed. The horizontal overflow from the negative-margin sticky header/footer pattern is purely cosmetic stretching and does not contain horizontally-scrollable content.

### File to update
- `src/components/ui/sheet.tsx` — line 63

### Change
```tsx
// Before
<div className="flex-1 overflow-y-auto p-6">

// After
<div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
```

Single line change, no other files affected.

