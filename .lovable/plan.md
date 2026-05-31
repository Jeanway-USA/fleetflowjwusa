# Plan: Intelligent invite handling for existing users

## Overview

Update `supabase/functions/invite-user/index.ts` so that when an invited email already belongs to an existing auth user, we **don't** create a new auth user and **don't** auto-add them to the org. Instead, we write a pending row to a new `public.invitations` table and send a tailored "you've been invited to a new organization" email. New users continue through the existing Supabase invite flow.

## 1. New table: `public.invitations`

Created via migration with full GRANTs and RLS.

Columns:
- `id uuid pk default gen_random_uuid()`
- `email text not null` (lowercased)
- `org_id uuid not null`
- `role app_role not null`
- `driver_id uuid null` — when inviting an existing driver row
- `requires_onboarding boolean not null default false`
- `status text not null default 'pending'` — `pending | accepted | revoked | expired`
- `token uuid not null unique default gen_random_uuid()` — used in accept-invite link
- `invited_by uuid not null` — auth user id of the owner
- `invited_user_id uuid null` — set when the invitee already has an auth account
- `is_existing_user boolean not null default false`
- `expires_at timestamptz not null default now() + interval '14 days'`
- `accepted_at timestamptz null`
- `created_at timestamptz not null default now()`
- Partial unique index on `(lower(email), org_id) where status = 'pending'` to prevent duplicate live invites.

RLS:
- `GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated`; `GRANT ALL ... TO service_role`. No `anon` grant.
- Owners can manage invitations for their own org (`is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid())`).
- An invitee can SELECT their own invitations by `lower(email) = lower(auth.email())` so the accept-invite page can show pending invites for the logged-in user.

## 2. Edge function changes — `supabase/functions/invite-user/index.ts`

Keep current: CORS, auth header → `getClaims`, owner check, body parsing/validation, org_id lookup.

New branching after we have `existingUser` (from the existing paginated `listUsers` loop) and a parallel lookup in `profiles` by lowercased email (to catch a profile that exists even if the auth user lookup is flaky):

**A. Existing user path (auth user OR profiles row found):**
1. Skip `generateLink` entirely — no new auth user.
2. Skip cross-org auto-link of `profiles.org_id` and skip `user_roles` upsert.
3. Insert a row into `public.invitations` with `is_existing_user = true`, `invited_user_id` set if known, `requires_onboarding`, `role`, `driver_id`, `org_id`, `invited_by = requestingUser.id`. If a `pending` row already exists for `(email, org_id)`, refresh its `expires_at`, `role`, `requires_onboarding` instead of inserting a duplicate.
4. Send a tailored Resend email: subject `You've been invited to join <Org> on Fleet Flow TMS`, body explains they already have an account and a button links to `${appUrl}/auth/accept-invite?token=<invitations.token>`.
5. Return `200` with `{ success: true, is_existing_user: true, invitation_id, message }`.

**B. New user path (no auth user, no profile):**
- Unchanged from current code: `generateLink({ type: 'invite' })`, link profile org, set `requires_onboarding`, assign role, create/link driver row, send existing branded Resend invite email.
- Return existing `200` response, plus `is_existing_user: false`.

Driver linking for existing-user invites is deferred to invitation acceptance (handled later in `AcceptInvite.tsx`) so it isn't covered in this change beyond storing `driver_id` on the invitation row.

## 3. What's NOT in this change

- The `AcceptInvite.tsx` flow that consumes invitation tokens (assigns role, links profile/driver, marks invitation accepted) — flagged as the natural follow-up but out of scope here.
- Cron job to expire stale invitations.
- UI to list pending invitations in Settings.

## Technical notes

- Tailored email reuses the existing inline HTML template style; only header copy and CTA URL change.
- Resend send is wrapped in try/catch — invitation row is still created if email fails (matches current behavior).
- Cross-org hijack guard from the current code is preserved but only relevant on the new-user branch's defensive re-check.
- `lower(email)` everywhere to keep matching consistent with the existing `ilike` driver lookup.
