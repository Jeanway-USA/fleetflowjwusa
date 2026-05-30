## Goal
Capture first and last name when inviting a user so their printed name (used in onboarding) is correct instead of falling back to their email prefix.

## Changes

### 1. `src/components/settings/TeamManagementTab.tsx` (Invite sheet UI)
- Add `inviteFirstName` and `inviteLastName` state.
- Add two required `Input` fields ("First Name", "Last Name") above the email field in the Invite Team Member sheet.
- Pass `first_name` and `last_name` in the `supabase.functions.invoke('invite-user', { body })` call.
- Reset both fields on close/success.

### 2. `supabase/functions/invite-user/index.ts`
- Already accepts `first_name` / `last_name` in the body and uses them for the drivers row. Extend so it also:
  - Passes them into `supabaseAdmin.auth.admin.generateLink({ options: { data: { invited_role, first_name, last_name } } })` so the existing `handle_new_user` trigger writes them onto the profile.
  - After the invite (and for the "existing user" branch), upserts `first_name` / `last_name` directly into `public.profiles` for `targetUserId` when provided, so the profile has the correct name even if the trigger already ran.

### 3. `src/pages/AcceptInvite.tsx`
- No name fields here — name comes from the invite. After `updateUser({ password })`, call a lightweight upsert into `profiles` only if `first_name`/`last_name` are still null (defensive; usually the edge function already set them). Optional; can skip if step 2 reliably writes the profile.

## Out of scope
- No change to the public `/auth` self-signup flow (it already collects first/last name on signup and `handle_new_user` stores them).
- No schema/RLS changes — `profiles.first_name` and `profiles.last_name` already exist.
- No change to onboarding renderers; they read `profiles.first_name` + `profiles.last_name`, which will now be populated.

## Result
- Invited users have their real name on their profile from the moment the invite is accepted, so onboarding documents print the correct name instead of the email prefix.
- Self-signups continue to use the names entered on the signup form.
