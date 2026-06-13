## Plan

1. **Stop simulation state from blocking owner navigation**
   - Update the dashboard switch handler so owners navigate first, then role simulation is applied after the route change starts.
   - This avoids the current intermediate state where the app is still on the old page but already simulating a role that cannot access that old page.

2. **Make owner dashboard buttons deterministic**
   - Replace the current `flushSync` approach in `AppSidebar` with a safer deferred simulation update.
   - Keep “Executive View” clearing simulation, and keep Dispatcher/Driver/Maintenance View applying their simulated role.

3. **Narrow the auto-exit behavior**
   - Adjust `ProtectedRoute` so it does not clear simulation during dashboard-switch navigation.
   - Preserve the useful behavior where an owner is not trapped if they manually land on a page the simulated role cannot access.

4. **Validate the exact workflow**
   - Fresh owner load on Executive Dashboard.
   - Click Dispatcher View, Driver View, Maintenance View: each should navigate on the first click.
   - Click Executive View: simulation clears and returns to owner mode.
   - Click between simulation pages repeatedly: no extra Executive View reset should be required.

## Technical notes

- Primary files: `src/components/layout/AppSidebar.tsx` and `src/components/shared/ProtectedRoute.tsx`.
- The root issue is ordering between `setSimulatedRole(...)`, React Router navigation, and the access guard. I’ll make route changes win before simulation enforcement runs.