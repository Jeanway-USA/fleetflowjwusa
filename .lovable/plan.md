# Command Center Layout Fix

File: `src/pages/DispatcherDashboard.tsx` only.

## Changes

1. **Remove `UpcomingPickups` from the Command Center tab** — delete the `<ErrorBoundary>` wrapping `<UpcomingPickups />` inside the right column (lines ~236–238). Leave the import in place if unused elsewhere or drop it (will check on build; safe to remove).

2. **Match Alerts height to Map**
   - Add `items-stretch` to the map/alerts grid.
   - Wrap the Map column and Alerts column with `h-full flex flex-col` and pass `className="h-full"` down where possible; the alerts `<ErrorBoundary>` gets `h-full` and its child `<DispatcherAlerts />` container/card already fills the wrapper (its root Card has no fixed height). Since `UpcomingPickups` is gone, Alerts is the only widget in the right column and will now stretch naturally when we drop the `space-y-6` wrapper and use `h-full`.

3. **Move the Quick Actions bar into the Command Center tab**
   - Cut the "Quick Actions Footer" Card (lines 278–300) out of the outer container.
   - Re-insert it inside `TabsContent value="command-center"` as a full-width row **beneath** the map/alerts grid (still inside the `space-y-6` stack, so the existing gap is preserved).
   - This removes the footer from Dispatch Board and Fleet Roster tabs; the user explicitly wants it scoped to the Command Center to eliminate the dead space below the map.

## Result

```text
[ In Transit Map        2/3 ] [ Alerts & Actions 1/3 ]   <- equal height row
[ Quick Actions: All Loads · All Drivers · All Trucks ]  <- full-width
```

No new components, no other tab changes, no CSS files touched.
