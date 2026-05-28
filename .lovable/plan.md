## Fix Quick Actions button layout

**File:** `src/pages/MaintenanceDashboardHome.tsx` (lines ~661–677, inside `QuickActionsCard`)

The Quick Actions buttons currently use a horizontal layout (`justify-start` with `flex-col items-start` text block), which combined with the default Button styling pushes the icon to the left edge and stretches the text awkwardly. Switch to a centered vertical stack.

### Changes

1. Update the `<Button>` className from:
   ```
   w-full justify-start gap-3 h-auto py-3
   ```
   to:
   ```
   w-full h-auto flex flex-col items-center justify-center text-center gap-2 py-4
   ```

2. Bump the icon size for better vertical balance (`h-5 w-5` instead of `h-4 w-4`) and drop the now-unneeded `shrink-0`.

3. Replace the inner `<span className="flex flex-col items-start text-left min-w-0">` wrapper with a centered version: `flex flex-col items-center text-center min-w-0`.

4. Remove `truncate` on the helper line so the two short text lines sit naturally with default `leading-tight`; keep `truncate` on the label only if needed for very long labels (or drop it too since the button is now tall enough to wrap).

Result: icon sits just above the label, label and helper text are centered and close together, with even `py-4` padding top/bottom.

No other files or logic change.