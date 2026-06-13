## Plan

1. **Remove the fragile delayed simulation switch**
   - Stop using the `setTimeout(0)` re-apply pattern in `AppSidebar`.
   - Dashboard clicks should set the intended simulation state and destination together, without depending on timing between route changes and guard cleanup.

2. **Make owner navigation authoritative**
   - In `ProtectedRoute`, real owners should always be allowed through protected pages based on their real owner role.
   - Role simulation should continue to affect what navigation items and page UI they see, but it should not block routing for a real owner.

3. **Delete the auto-exit trap logic**
   - Remove the `ProtectedRoute` effect that clears simulation when the current simulated role cannot access the route.
   - That effect is now the likely source of the repeated “must click Executive View first” behavior because it keeps clearing the simulation during normal navigation.

4. **Keep explicit exit behavior**
   - “Executive View” and the simulation banner “Exit” will still clear simulation and navigate to `/executive-dashboard`.
   - Dispatcher/Driver/Maintenance dashboard buttons will set their simulated role and navigate to their dashboard immediately.

5. **Validate the workflow**
   - From a fresh owner load on Executive Dashboard: click Dispatcher View, Driver View, Maintenance View, and normal sidebar pages.
   - Confirm every click navigates on the first attempt and that Executive View/Exit still returns to owner mode.