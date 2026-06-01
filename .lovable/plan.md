## Goals

1. Stop showing cryptic "non-2xx" errors when the user's auth session has been invalidated server-side. Detect the stale session, surface a clear message, and force a clean re-login.
2. Document the preview vs custom-domain auth split so you stop chasing it as a bug.
3. Leave actual auth/login code paths untouched — they are working correctly on the custom domain.

## What's NOT in scope

- No change to login/signup forms, redirect URIs, OAuth config, or `supabase/client.ts`.
- No fix for "preview login goes to org creation" — that is an environmental property of Lovable Cloud Dev (Production users do not exist in Dev). The only workaround is to test logged-in flows on `tms.jeanwayusa.com`.
- No retroactive fix for invites/deletions that already failed; those just need to be retried after re-login.

## Changes

### 1. `src/contexts/AuthContext.tsx` — validate the cached session on boot

After `supabase.auth.getSession()` returns a session, call `supabase.auth.getUser()` once to confirm the session is still valid on the server. If it returns `AuthSessionMissingError` / `session_not_found` / 403, call `supabase.auth.signOut()`, clear local state, and let the existing `RoleBasedRedirect` send the user to `/auth`. Do this in the initial `getSession().then(...)` block only — not on every `onAuthStateChange` (would break tab focus, see Core memory rule).

### 2. `src/components/shared/ProtectedRoute.tsx` — guard against zombie sessions mid-app

Add a lightweight `useEffect` that listens for `supabase.auth.onAuthStateChange` events `SIGNED_OUT` and `USER_DELETED` and, on those, redirects to `/auth` with a toast: "Your session expired — please sign in again." No change to the existing render logic.

### 3. `src/components/settings/TeamManagementTab.tsx` (and any other place that calls `supabase.functions.invoke('invite-user', ...)`) — friendly 401 handling

When the invoke returns `error` and the response status is 401 (or message contains `Invalid token` / `Unauthorized`), call `await supabase.auth.signOut()` + `toast.error('Your session expired. Please sign in again to continue.')` + `navigate('/auth')`. Keep the existing generic error toast for any other failure.

I'll grep for `functions.invoke(` to apply the same handler in the small set of components that call protected functions (invite-user, delete-user, accept-invitation, create-checkout-session, create-portal-session). One shared helper in `src/lib/invoke-with-auth.ts` will wrap `supabase.functions.invoke` so the 401-recovery logic lives in one place.

### 4. `supabase/functions/invite-user/index.ts` — clearer 401 body

Change the `Invalid token` response body to `{ error: 'session_expired', message: 'Your session is no longer valid. Please sign in again.' }` so the client can detect it deterministically. No behavior change.

### 5. No changes needed to `delete-user`

That function is working as designed — when an admin deletes a user, Supabase invalidates that user's sessions, which is correct. The bug is only the client's failure to *notice* its own session was invalidated when the admin deletes themselves or when sessions get purged.

## Why this fixes the reported errors

- After step 1, opening the custom domain with a stale JWT will silently sign you out and re-prompt instead of letting you click around with an invalid token.
- After step 3, if a session goes stale *during* a session (e.g. right after a super-admin delete), the next edge-function call surfaces "session expired — sign in again" instead of "non-2xx".
- Step 2 covers cases where Supabase emits `SIGNED_OUT` from another tab or token refresh failure.

## What you still need to do manually

- Sign out of the custom domain and sign back in once after these changes deploy, to clear the current stale JWT in your browser.
- Continue doing logged-in QA on `tms.jeanwayusa.com`, not on the preview iframe.

## Files touched

- `src/contexts/AuthContext.tsx` (small addition)
- `src/components/shared/ProtectedRoute.tsx` (small addition)
- `src/lib/invoke-with-auth.ts` (new, ~30 lines)
- `src/components/settings/TeamManagementTab.tsx` and 3–5 other call sites (swap `supabase.functions.invoke` → `invokeWithAuth`)
- `supabase/functions/invite-user/index.ts` (one response body)
