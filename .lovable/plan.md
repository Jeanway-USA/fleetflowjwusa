## Goal
Fix the RBAC dead-end where protected pages show “You don’t have access to that page” but do not reliably send the user back to an accessible page.

## Plan
1. **Harden role home resolution**
   - Update `getRoleHomePath` so it can safely choose a real fallback route even when role data is incomplete or the user has a limited subscription tier.
   - Keep owners routed to `/executive-dashboard` by default instead of tier-specific pages that may be gated or unavailable.

2. **Fix protected-route fallback redirects**
   - Update `ProtectedRoute` to calculate a guaranteed fallback route from the authenticated role state.
   - Prevent redirect loops by falling back to `/pending-access` only when no usable role/home route exists.
   - Keep the access-denied toast, but ensure it is paired with a route change.

3. **Correct owner simulation behavior**
   - Preserve the intended dashboard “view as driver/dispatcher/maintenance” behavior for owners.
   - Avoid trapping owners in simulated roles without an accessible way back.

4. **Align feature-gating with routing**
   - Check routes that currently require tier features like `maintenance_full`, `dispatch`, `drivers`, and `insights`.
   - Where the route is role-authorized but feature-gated, ensure the user sees the proper fallback instead of appearing locked out.

5. **Validate the fix**
   - Verify owner access to Driver Dashboard, Dispatcher Dashboard, Maintenance Home, Finance, Safety, and Settings.
   - Verify non-owner roles still cannot access disallowed sections and are redirected to their correct home route.