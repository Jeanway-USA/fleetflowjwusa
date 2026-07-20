# Add Upcoming Pickups to Dispatch Board

File: `src/pages/DispatcherDashboard.tsx` only.

## Changes

1. Re-add the import: `import { UpcomingPickups } from '@/components/dispatcher/UpcomingPickups';`

2. In the Dispatch Board tab's right-side column (currently just `<UnassignedLoadsDrawer />` in `lg:col-span-1`), stack the two widgets under a "Planning & Scheduling" heading:

```tsx
<div className="lg:col-span-1 space-y-6">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
    Planning & Scheduling
  </h3>
  <ErrorBoundary compact>
    <UnassignedLoadsDrawer />
  </ErrorBoundary>
  <ErrorBoundary compact>
    <UpcomingPickups />
  </ErrorBoundary>
</div>
```

No changes to `UpcomingPickups.tsx` — its existing 48-hour filter stays intact, and it already renders as a self-contained Card that fills its parent width, so it will size cleanly inside the 1/4-width column.

## Result

```text
[ 14-Day Fleet Timeline           3/4 ] [ Planning & Scheduling   1/4 ]
                                        [   Unassigned Loads          ]
                                        [   Upcoming Pickups (48h)    ]
[ Active Loads Board                              full width          ]
```
