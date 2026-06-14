Restore driver-facing access to the loads board. The component itself (`DriverLoadsView`) and the underlying odometer dialogs still exist and are fully functional — they include the Current / Upcoming / Completed tabs, the status-progression buttons, and the `StartingOdometerDialog` / `EndingOdometerDialog` intercepts. The only thing missing is a route and sidebar entry for drivers; today the view only renders when a driver opens `/fleet-loads`, but the route's `ProtectedRoute` excludes the `driver` role.

## Changes

1. **New page** `src/pages/DriverLoads.tsx` — thin wrapper that renders a `PageHeader` ("My Loads") plus `<DriverLoadsView />`.
2. **`src/App.tsx`** — register a lazy import and add:
   ```
   <Route path="/driver/loads" element={
     <ProtectedRoute allowedRoles={['owner', 'driver']}>
       <DriverLoads />
     </ProtectedRoute>
   } />
   ```
3. **`src/components/layout/AppSidebar.tsx`** — add a "My Loads" entry (icon `Package`, path `/driver/loads`, roles `['driver']`) to `dashboardNavItems` so drivers see it in their Main group. Owners already see Fleet Loads in Operations and don't need a duplicate.

## Out of scope

- `DriverLoadsView` itself is not modified; it already implements the tabbed UI, queries `fleet_loads` filtered by the authenticated user's `driver_id`, and triggers the odometer intercept dialogs on Start Load / Mark Delivered.
- No database, RLS, or odometer-dialog changes.