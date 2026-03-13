

## Analysis

The deactivation redirect logic is **mostly in place** but has one critical gap:

**`ProtectedRoute`** checks `orgIsActive` but does **not** wait for `orgLoading` to resolve. Since `orgIsActive` defaults to `true` in AuthContext state, there's a race condition: a user with a deactivated org can briefly access protected dashboard pages before `fetchOrgData` completes and sets `orgIsActive = false`.

**`RoleBasedRedirect`** correctly waits for `orgLoading` — no issue there.

**`SuperAdminGuard`** does not check `orgIsActive` — this is correct since super admins should always have access.

## Plan

### 1. `src/components/shared/ProtectedRoute.tsx` — Wait for `orgLoading`

Add `orgLoading` to the destructured auth values and include it in the loading gate:

```tsx
const { user, loading, rolesLoading, orgLoading, hasRole, orgIsActive, orgId } = useAuth();

if (loading || rolesLoading || orgLoading) {
  // show spinner
}
```

This is the only change needed. It closes the race condition where `orgIsActive` is still `true` (default) while org data is being fetched.

### Why nothing else needs to change

- `RoleBasedRedirect` already waits for `orgLoading` and redirects to `/account-deactivated` when `!orgIsActive` — correct.
- `ProtectedRoute` already redirects to `/account-deactivated` when `orgId && !orgIsActive` — correct, just needs the loading gate fix.
- `/account-deactivated` is an unprotected route (no `ProtectedRoute` wrapper) — correct, so deactivated users can reach it.
- `SuperAdminGuard` bypasses org checks — correct by design.

### Files to edit
- `src/components/shared/ProtectedRoute.tsx` — Add `orgLoading` to loading check (one-line change)

