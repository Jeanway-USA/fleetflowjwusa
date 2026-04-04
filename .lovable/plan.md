

## Fix: Page Flashes Loading Spinner on Tab Return

### Root Cause

The `refetchOnWindowFocus` fix only addressed React Query. The real culprit is the **Supabase auth listener** in `AuthContext.tsx` (line 179).

When you switch tabs and return, Supabase automatically refreshes the auth token (`autoRefreshToken: true`). This fires `onAuthStateChange` with a `TOKEN_REFRESHED` event. The current handler treats every event the same: it sets `rolesLoading = true` and `orgLoading = true` (lines 185-186), then re-fetches roles and org data. Meanwhile, `ProtectedRoute` (line 20) shows a **full-screen loading spinner** whenever those flags are true -- that is the "refresh" you see.

### Fix

**File: `src/contexts/AuthContext.tsx` -- `onAuthStateChange` callback (lines 179-206)**

Skip the re-fetch when the event is `TOKEN_REFRESHED` and the user ID hasn't changed. Only re-fetch roles/org on meaningful auth events (`SIGNED_IN`, `INITIAL_SESSION`, or when the user actually changes).

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  const previousUserId = user?.id;
  setSession(session);
  setUser(session?.user ?? null);

  if (session?.user) {
    // Only re-fetch roles/org when the user actually changed
    // (not on TOKEN_REFRESHED which fires on tab focus)
    const userChanged = session.user.id !== previousUserId;
    if (userChanged) {
      setRolesLoading(true);
      setOrgLoading(true);
      setTimeout(() => {
        fetchUserRoles(session.user.id).then(...);
        fetchOrgData(session.user.id).finally(...);
      }, 0);
    }
  } else {
    // signed out -- clear everything
    ...
  }
  setLoading(false);
});
```

This uses a ref to track the current user ID so token refreshes don't trigger loading states and re-fetches.

### Files Modified
- `src/contexts/AuthContext.tsx` -- Guard the `onAuthStateChange` callback to skip re-fetching on `TOKEN_REFRESHED` events when the user hasn't changed.

