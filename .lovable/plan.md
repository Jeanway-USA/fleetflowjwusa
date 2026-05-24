## Problem

Clicking **Super Admin** redirects you back to `/` even though your account is in `super_admins` and the sidebar correctly shows the button.

## Root cause

`src/components/shared/SuperAdminGuard.tsx` has a race condition in its effect:

```ts
useEffect(() => {
  if (loading || !user) {
    setChecking(false);   // <-- sets checking=false during initial loading
    return;
  }
  supabase.rpc('is_super_admin').then(...)
}, [user, loading]);
```

Timeline when navigating to `/super-admin`:
1. First render: `loading=true` → effect runs → `setChecking(false)`. Render shows spinner because `loading` is still true.
2. `loading` flips to `false`. Effect re-runs, fires the `is_super_admin` RPC. But `checking` is already `false` and `isSuperAdmin` is still `false`.
3. Render sees `!loading && !checking && !isSuperAdmin` → returns `<Navigate to="/" />` **before the RPC resolves**.

The sidebar works because `AuthContext.isSuperAdmin` defaults differently and doesn't gate navigation.

## Fix

Edit only `src/components/shared/SuperAdminGuard.tsx`:

- Keep `checking=true` while `loading` is true (don't prematurely clear it).
- Reset `checking=true` before kicking off the RPC.
- Only `setChecking(false)` after the RPC resolves, or when there's confirmed no user.

Resulting effect:

```ts
useEffect(() => {
  if (loading) return;                  // wait for auth to settle
  if (!user) { setChecking(false); return; }
  setChecking(true);
  supabase.rpc('is_super_admin').then(({ data, error }) => {
    setIsSuperAdmin(!error && data === true);
    setChecking(false);
  });
}, [user, loading]);
```

No other files, no DB or RLS changes — `super_admins` membership is already correct.

## Verification

After the fix, clicking Super Admin from the sidebar (or navigating to `/super-admin` directly) should briefly show the spinner, then render the Super Admin Dashboard.
