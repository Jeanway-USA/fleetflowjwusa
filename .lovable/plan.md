# Invitation Acceptance Flow

## Goal
When an existing user clicks the "You've been invited" email link (`/auth/accept-invite?token=...`), consume the invitation, move them onto the new organization, reset their onboarding state, and route them to `/driver/onboarding` when the invite requires it.

## Important note on "signed document URLs"
The request mentions clearing `signed_driver_agreement_url` on the profile. That column (and siblings) does not exist on `public.profiles`. Signed documents live in `public.driver_signed_documents`, keyed by `driver_id` + `org_id`. Because RLS isolates those rows by `org_id`, switching the user's `org_id` already hides the old org's signed docs and naturally forces re-signing for the new org. So **no destructive delete is needed** — the onboarding gate will trigger from `requires_onboarding = true` alone. If you want hard cleanup of old-org docs, that should be a separate explicit decision (they may be retained for compliance).

## Scope of changes

### 1. New edge function `accept-invitation` (`supabase/functions/accept-invitation/index.ts`)
Token lookup + cross-org profile mutation must run with `service_role` (the user's JWT can't update an `invitations` row owned by a different org, and they can't bypass `profiles` policies for an org-switch).

Flow:
1. Require auth header; resolve calling user via `getClaims`.
2. Read body `{ token: string }`.
3. Fetch invitation by `token`. Validate: `status = 'pending'`, not expired, and `lower(email) === lower(user.email)`. Otherwise return 400 with reason (`invalid | expired | email_mismatch | already_accepted`).
4. With service-role client:
   - `update profiles set org_id = invitation.org_id, requires_onboarding = invitation.requires_onboarding, onboarding_completed = false where user_id = auth_user.id`.
   - Replace `user_roles` for this user: delete existing rows, insert `(user_id, role = invitation.role)`. (Roles are per-org in this app's model; matches current invite-user behavior.)
   - If `invitation.driver_id` present, set `drivers.user_id = auth_user.id` for that driver row (scoped to invitation.org_id).
   - `update invitations set status='accepted', accepted_at=now(), invited_user_id=auth_user.id where id = invitation.id`.
5. Return `{ success: true, requires_onboarding, org_id }`.

`supabase/config.toml`: add `[functions.accept-invitation] verify_jwt = true` block (we need the caller's identity).

### 2. `src/pages/AcceptInvite.tsx` rework
Today this page only handles the "set password" flow for brand-new auth users. Extend it to also handle the existing-user token flow.

Behavior:
- Read `token` from `useSearchParams()`.
- Wait for session via existing `onAuthStateChange` / `getSession`.
- Branching:
  - **No `token` param** → existing behavior (set password for invited new user).
  - **`token` present + no session** → show "Sign in to accept this invitation" card with a button that routes to `/auth?redirect=/auth/accept-invite?token=...` (preserve token through login).
  - **`token` present + session ready** → auto-call `supabase.functions.invoke('accept-invitation', { body: { token } })` once. While running, show "Joining {org}..." spinner state.
    - On success: call `refreshOrgData()` + `refreshRoles()` from `useAuth()`, toast "You've joined {orgName}", then `navigate(requires_onboarding ? '/driver/onboarding' : '/', { replace: true })`.
    - On `email_mismatch`: show error card "This invite was sent to a different email. Sign out and sign in as {email}." with a Sign-out button.
    - On `expired` / `already_accepted` / `invalid`: friendly error card with a "Back to dashboard" button.

### 3. `src/contexts/AuthContext.tsx`
- Export `refreshOrgData` and `refreshRoles` are already available — confirm they're in the context value. If not, add them. No other changes.

### 4. `src/App.tsx`
No route changes (`/auth/accept-invite` already exists). Ensure the route is reachable without `ProtectedRoute` (it already is).

### 5. Auth page redirect support (`src/pages/Auth.tsx`)
After successful sign-in, honor a `?redirect=` query param so users following the invite email after logging out land back on `/auth/accept-invite?token=...`. Small addition; only if not already supported.

## Out of scope
- Deleting historical `driver_signed_documents` rows from the prior org.
- UI for a user to see/manage multiple pending invitations.
- Multi-org membership (this flow continues the single-active-org model — accepting an invite moves the user, it does not add a membership).
- Cron to expire stale invitations.

## Files touched
- `supabase/functions/accept-invitation/index.ts` (new)
- `supabase/config.toml` (add function block)
- `src/pages/AcceptInvite.tsx` (extend)
- `src/pages/Auth.tsx` (honor `?redirect=` after login, if missing)
- `src/contexts/AuthContext.tsx` (only if `refreshOrgData`/`refreshRoles` aren't exposed)
