## Audit findings — `src/contexts/AuthContext.tsx` + `ProtectedRoute.tsx`

### What's already correct
- `ProtectedRoute` blocks on **all three** flags: `loading || rolesLoading || orgLoading`. A protected page cannot render or redirect until session, roles, and org are resolved. ✅
- `INITIAL_SESSION` is skipped in the listener to avoid duplicating the boot block's fetches. ✅
- `subscription.unsubscribe()` runs in the effect cleanup. ✅
- `getUser()` re-validates cached JWTs server-side before trusting them. ✅
- Boot block has try/finally so `loading` always flips off. ✅

### Real issues to fix

1. **No `isMounted` guard around the async boot IIFE.** Under React StrictMode (dev) the provider mounts → unmounts → remounts. The first mount's async boot keeps running and calls `setSession/setUser/setRoles` after unmount, racing against the second mount's state and producing "setState on unmounted component" noise + can clobber the live user with stale data from the discarded mount.

2. **Concurrent SIGNED_IN race during boot.** If a `SIGNED_IN` event fires while the boot block is still awaiting `getSession()`/`getUser()`, both paths fetch roles/org in parallel — the slower one's `setRoles`/org setters win and may overwrite the correct values. Need a single source of truth: skip the listener's fetch if `currentUserIdRef` is already pointing at that user (already done) **and** skip the boot fetch if the listener already populated state for the same user while boot was awaiting.

3. **Duplicate `onAuthStateChange` listener inside `ProtectedRoute`.** Every protected route mounts its own subscription (and there are ~30 protected routes). On navigation between protected pages this churns subscriptions, and on `SIGNED_OUT` the toast can fire from whichever listener resolves first. This belongs in `AuthProvider`, not in each route.

4. **`signOut` leaks org state.** It clears `session`, `user`, `roles`, and `simulatedRole`, but leaves `orgId`, `orgName`, `subscriptionTier`, `tmsMode`, `primaryColor`, `logoUrl`, `bannerUrl`, `orgIsActive`, `requiresOnboarding`, `onboardingCompleted`, `isSuperAdmin` populated. If a different account signs in next, there's a brief window where the previous tenant's branding/org is visible.

5. **`fetchOrgData` uses `.single()` with no try/catch.** A missing profile row throws and silently rejects the promise — `orgLoading` does flip off (via `.finally`) but `requiresOnboarding`/`onboardingCompleted` retain whatever they had before, which is the previous user's values after a fast user switch.

6. **`refreshOrgData` / `refreshRoles` don't flip their loading flags.** Callers that rely on `orgLoading` see stale `false` while a refresh is in flight. Minor — only matters if a consumer reads the flag during refresh.

### Plan

#### `src/contexts/AuthContext.tsx`
- Add `isMountedRef = useRef(true)` set to `false` in the effect cleanup. Wrap every `setState` in the boot IIFE and the async `.then/.finally` callbacks of `fetchUserRoles` / `fetchOrgData` (in both boot and listener) with an `isMountedRef.current` check.
- Add a "boot already handled this user" check: after boot finishes setting `currentUserIdRef`, compare against `previousUserIdRef` snapshot taken at boot start; if listener already advanced the ref to the same user, skip boot's role/org fetch (listener already fired them).
- In `signOut`, clear org-related state (`orgId`, `orgName`, `subscriptionTier='solo_bco'`, `tmsMode`, `primaryColor`, `logoUrl`, `bannerUrl`, `orgIsActive=true`, `requiresOnboarding=false`, `onboardingCompleted=false`, `isSuperAdmin=false`, `simulatedRole=null`) alongside the existing clears.
- Wrap `fetchOrgData` body in try/catch; reset `requiresOnboarding`/`onboardingCompleted`/org fields to defaults on failure so they can't carry over from a previous user.
- Make `refreshOrgData` / `refreshRoles` flip their respective loading flags around the fetch.
- Add `SIGNED_OUT` handling in the main listener: explicitly clear org state (same reset used by `signOut`) so it works for revocations from another tab.

#### `src/components/shared/ProtectedRoute.tsx`
- Remove the local `onAuthStateChange` subscription. Move that SIGNED_OUT toast + redirect logic into `AuthProvider` so it runs once globally. Use a `useNavigate`-free approach: dispatch the toast and let the provider's state change (`user → null`) cause `ProtectedRoute`'s existing `if (!user) return <Navigate to="/auth" />` to fire on the next render.

### Out of scope
- Memoizing `hasRole` / derived booleans (separate perf concern).
- Migrating role storage (already correct via `user_roles` + RLS).
- The duplicate-fetch in StrictMode dev (intentional React behavior, documented in previous QA pass).

### Verification
1. Open `/executive-dashboard`, hard refresh, watch Network: `user`, `user_roles`, `profiles`, `organizations` each fire once per StrictMode mount (still 2× in dev, but no extra race-induced duplicates).
2. Sign out from a second tab → first tab shows toast and redirects to `/auth` once (not N times for N mounted protected routes).
3. Sign in as user A, sign out, sign in as user B → branding/org name swap immediately with no flash of A's data.
4. Console: no "setState on unmounted component" warnings during fast nav.