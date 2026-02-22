

## Fix: Refresh roles after onboarding so owner isn't sent to "Pending Access"

### Problem
The `create_onboarding_org` database function correctly creates the org, links the profile, and assigns the "owner" role. However, when onboarding finishes and calls `refreshOrgData()`, that function only re-fetches the org profile data (org_id, name, tier). It does **not** re-fetch the user's roles. Since the AuthContext still has an empty roles array from the initial login (before onboarding created the role), `RoleBasedRedirect` sees no roles and redirects to `/pending-access`.

### Solution
Add a `refreshRoles` capability to AuthContext and call it alongside `refreshOrgData` at the end of onboarding.

### Technical Details

**`src/contexts/AuthContext.tsx`:**
- Extract the role-fetching logic into a new `refreshRoles` async function exposed on the context
- It will call the existing `fetchUserRoles` and update the `roles` state

**`src/pages/Onboarding.tsx`:**
- Import `refreshRoles` from `useAuth()`
- In `handleStep3`, after `refreshOrgData()`, also call `await refreshRoles()` before navigating home

This ensures the AuthContext has the freshly-assigned "owner" role by the time `RoleBasedRedirect` evaluates routing.

