

## Fix Close Button Clipping in Sheet Component

### Problem
The "X" close button in the New Work Order sheet (and all sheets site-wide) is being cut off. The close button sits inside the `SheetContent` which has `overflow-y-auto` applied directly, causing the absolutely-positioned close button to be clipped.

### Root Cause
The Dialog component was previously fixed by separating the outer container (`overflow-hidden`) from an inner scrollable wrapper (`overflow-y-auto`), and giving the close button `z-30`. The Sheet component never received this same fix.

### Fix
Apply the same pattern from `dialog.tsx` to `sheet.tsx`:

1. **Remove `overflow-y-auto` from the outer `SheetPrimitive.Content`** — replace with `overflow-hidden` and `flex flex-col`
2. **Add `z-30` to the close button** so it stays above scrolling content
3. **Wrap `{children}` in a scrollable inner div** with `flex-1 overflow-y-auto`

### File to update
- `src/components/ui/sheet.tsx` — lines 58–63 of `SheetContent`

### What changes
```tsx
// Before (line 58)
<SheetPrimitive.Content className={cn(sheetVariants({ side }), "overflow-y-auto", className)}>
  {children}
  <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm ...">

// After
<SheetPrimitive.Content className={cn(sheetVariants({ side }), "overflow-hidden flex flex-col", className)}>
  <SheetPrimitive.Close className="absolute right-4 top-4 z-30 rounded-sm ...">
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </SheetPrimitive.Close>
  <div className="flex-1 overflow-y-auto p-6">
    {children}
  </div>
```

The `SheetHeader` and `SheetFooter` negative-margin sticky patterns will continue to work inside the scrollable wrapper since they use `sticky` positioning.

