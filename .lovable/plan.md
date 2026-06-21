Migration is live. Now wire the client to use it:

### `src/components/superadmin/OrgActionsDropdown.tsx`
Replace `handleSimulate` to call `super_admin_start_impersonation(target_org_id)` first, then set the localStorage label, invalidate React Query, and navigate to `/executive-dashboard`. Toast on error.

### `src/contexts/AuthContext.tsx`
- `clearOrgSimulation`: call `super_admin_stop_impersonation()`, then clear localStorage, refresh org data + roles, and emit the `simulatedOrgChanged` event. Make it async.
- On boot (after super-admin check), call `super_admin_impersonation_state()` and, if a row is returned, populate `simulatedOrgId`/`simulatedOrgName` from it so the banner survives refresh.
- Remove the client-only override on `orgId`/`subscriptionTier` in the provider value — `profiles.org_id` is now the impersonated org, so `orgId` and `subscriptionTier` come from `fetchOrgData` naturally. Keep `simulatedOrgId`/`simulatedOrgName` only to drive the banner + exit button.

### `src/components/layout/DashboardLayout.tsx`
No structural change — banner already reads `simulatedOrgId`/`simulatedOrgName` and the exit click already calls `clearOrgSimulation` (which is now async + RPC-backed).