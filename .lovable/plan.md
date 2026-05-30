## Problem

When you create a login for a new driver (via Invite User with role = driver), three things break:

1. **No `drivers` row is created or linked.** `invite-user` only creates the auth user, sets `profiles.org_id`, and assigns the `driver` role. The `DriverOnboarding` page requires a row in `public.drivers` where `user_id = auth.uid()`, so the new driver hits *"Driver profile not found for your account."*
2. **Nothing routes the driver into onboarding.** After login, `RoleBasedRedirect` sends drivers straight to `/driver-dashboard`. They never see `/driver/onboarding`.
3. **No onboarding status on the Drivers page.** The owner can't see whether a driver has logged in, started signing, or finished onboarding.

## Plan

### 1. Extend `invite-user` edge function
- Accept an optional `driver_id` and optional `first_name` / `last_name` in the request body.
- When `role === 'driver'`:
  - If `driver_id` is provided → update that drivers row to set `user_id = targetUserId` (only if its `user_id` is currently null and `org_id` matches).
  - Else, look up an existing `drivers` row in the org by email (matching `auth.users.email`); link it if found.
  - Else, insert a new `drivers` row with `{ org_id, user_id: targetUserId, first_name, last_name, email, status: 'active', pay_type: 'percentage', pay_rate: 0 }`.
- Idempotent: re-inviting an already-linked driver is a no-op for the drivers table.

### 2. Update the Drivers page (`src/pages/Drivers.tsx`)
- Add an **"Invite to log in"** button on each driver card that has no `user_id`. It opens a small dialog (prefilled with the driver's email), calls `invite-user` with `{ email, role: 'driver', driver_id, first_name, last_name }`, then refreshes the list.
- After a successful invite, show a toast and the card flips to a "Invitation sent" state.
- Add an **onboarding status badge** to each driver card with three states, computed from a new lightweight query:
  - `Not invited` — `user_id` is null.
  - `Onboarding pending` — `user_id` set but no rows in `driver_signed_documents` for that driver.
  - `Onboarded` — at least one row in `driver_signed_documents` exists (or matches the count of active templates — TBD, start with "any row").

### 3. Force first-login onboarding for drivers
- In `RoleBasedRedirect.tsx`, when the user has the `driver` role:
  - Run a quick query: count of `driver_signed_documents` for the linked driver vs. count of active `document_templates` in the org.
  - If the driver has no signed docs yet **and** there is at least one active template, redirect to `/driver/onboarding` instead of `/driver-dashboard`.
  - Otherwise keep the existing redirect to `/driver-dashboard`.
- Add a loading state while this check resolves to avoid a flash of the dashboard.
- Also harden `DriverOnboarding.tsx` to render a friendlier "Your driver profile isn't linked yet — please contact your administrator" empty state instead of throwing when no `drivers` row exists.

### 4. Verification
- Invite a brand-new email as a driver from `/drivers` → email arrives, user signs up, lands directly on `/driver/onboarding`, signs the docs, and is then routed to `/driver-dashboard` on next visit.
- On the owner's `/drivers` page, the card shows `Invitation sent → Onboarding pending → Onboarded` as the driver progresses.
- Re-inviting the same driver does not duplicate the drivers row.

## Technical notes

- No schema changes required: `drivers`, `driver_signed_documents`, `document_templates`, `profiles`, and `user_roles` already support this flow.
- `invite-user` runs with the service role, so it can write `drivers` directly while still respecting org isolation in code.
- The onboarding-completion check is intentionally lightweight (one count query keyed on `driverId` + `orgId`) so it doesn't slow down the post-login redirect.
- Files touched: `supabase/functions/invite-user/index.ts`, `src/pages/Drivers.tsx`, `src/components/shared/RoleBasedRedirect.tsx`, `src/pages/DriverOnboarding.tsx` (empty-state copy only).
