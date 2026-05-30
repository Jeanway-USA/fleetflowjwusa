## Plan: Persist onboarding flags and hard-gate the driver dashboard

### Current state

- `TeamManagementTab` already sends `requires_onboarding: boolean` to the `invite-user` edge function.
- `invite-user/index.ts` reads it but only logs it — **the flag is never persisted** anywhere.
- `profiles` has no `requires_onboarding` or `onboarding_completed` column.
- Today, `RoleBasedRedirect` infers "needs onboarding" indirectly by counting unsigned templates. `ProtectedRoute` on `/driver-dashboard` (the actual path; `/driver/dashboard` does not exist) does not block access — a driver who navigates there directly is not redirected.

The user wants explicit, durable flags + a hard block on the dashboard.

### Database changes (one migration)

Add two columns to `public.profiles`:

- `requires_onboarding boolean NOT NULL DEFAULT false` — set true when an invited driver needs to sign onboarding docs.
- `onboarding_completed boolean NOT NULL DEFAULT false` — flipped to true the moment `DriverOnboarding` finishes its final submission.

Backfill existing drivers so we don't accidentally lock anyone out:
- For every profile whose user has the `driver` role AND already has ≥1 row in `driver_signed_documents`, set `onboarding_completed = true`.
- All other existing driver profiles get `requires_onboarding = true, onboarding_completed = false` (so legacy drivers without signed docs are sent through the new flow).

No new RLS policies needed — existing profile policies already cover these columns.

### Invite pipeline

1. **`supabase/functions/invite-user/index.ts`** — persist the flag:
   - For brand-new invites: pass `requires_onboarding` inside `options.data` so it lands in `auth.users.raw_user_meta_data`, AND upsert it onto the profile row after the user accepts and a profile is created.
   - For existing users being re-assigned to an org: directly update `profiles.requires_onboarding` alongside the existing `org_id` update.

2. **Signup trigger / profile bootstrap** — wherever the profile is auto-created on first login (likely `handle_new_user` trigger), copy `requires_onboarding` from `raw_user_meta_data` into the profile row. If no such trigger exists, do the upsert in `AuthContext` right after profile fetch.

### Auth & routing changes

3. **`src/contexts/AuthContext.tsx`** — extend `fetchOrgData` to also select `requires_onboarding, onboarding_completed`. Expose them on the context: `requiresOnboarding: boolean`, `onboardingCompleted: boolean`.

4. **`src/components/shared/RoleBasedRedirect.tsx`** — replace the "count unsigned templates" check with a direct flag check:
   ```ts
   if (hasRole('driver') && requiresOnboarding && !onboardingCompleted) {
     return <Navigate to="/driver/onboarding" replace />;
   }
   ```
   Keep the existing fallback for drivers whose flags are both false (legacy / non-onboarding drivers).

5. **`src/components/shared/ProtectedRoute.tsx`** — add a hard guard: if the user is a driver and `requiresOnboarding && !onboardingCompleted`, redirect to `/driver/onboarding` regardless of which protected route they tried to load. This is what closes the "type the URL directly" loophole on `/driver-dashboard` and any other driver-accessible page.

6. **`src/pages/DriverOnboarding.tsx`** — inside `finalizeSubmission`, after all signed-document rows insert successfully, update the current user's profile: `onboarding_completed = true`. Then `navigate('/driver-dashboard')`.

### Acceptance criteria

- Inviting a driver with the "requires onboarding" checkbox stores `requires_onboarding = true` on their profile by the time they first sign in.
- That driver is auto-redirected to `/driver/onboarding` from `/`, from `/driver-dashboard`, and from any other protected page until they finish.
- Completing the final step of `DriverOnboarding` sets `onboarding_completed = true` and unblocks `/driver-dashboard`.
- Existing drivers with prior signed docs are not locked out (backfill handles this).
- Owners, dispatchers, payroll, safety, etc. are unaffected — the guard only applies when the driver role is present and `requires_onboarding` is true.

### Technical notes

- One Supabase migration adds the columns + backfill in a single transaction.
- Edge-function changes deploy automatically — no manual deploy step.
- The new ProtectedRoute guard runs only after `orgLoading` resolves, so it doesn't flash on first paint.
- Path is `/driver-dashboard` (hyphen), not `/driver/dashboard` as written in the request; the guard covers all driver-reachable routes either way.
