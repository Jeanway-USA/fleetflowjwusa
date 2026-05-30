## Problem

When an owner invites a new user (e.g. a driver) via the Team / Drivers screen, the `invite-user` edge function calls `supabase.auth.admin.inviteUserByEmail(email)`. That creates an `auth.users` row in **invited state with no password set**.

Our custom Resend email then sends them to `/auth`, where they "sign up" with a password. But because the email is already registered, Supabase's `signUp()` silently no-ops (Supabase obfuscates "user exists" by returning a fake user). No password is ever stored. The session you see immediately after is just the leftover invite session — once they sign out, password login fails with `invalid_credentials` (which is exactly what the auth logs show for `ajb06.jrb07@gmail.com`).

## Fix

Switch the invite flow to **generate a real Supabase invite/recovery link** and route the user through a password-setup page, instead of relying on a plain `/auth` signup.

### 1. `supabase/functions/invite-user/index.ts`

- Replace `auth.admin.inviteUserByEmail(email, {...})` with `auth.admin.generateLink({ type: 'invite', email, options: { data: { invited_role: role }, redirectTo: `${appUrl}/auth/accept-invite` } })`.
- Use the returned `properties.action_link` as the button URL in the Resend email (instead of the static `/auth` link). This token, when opened, establishes a Supabase recovery session that lets the user set a password.
- Keep the existing "user already exists" branch unchanged (still just assigns role + org, no email link rewrite needed — but optionally send a "you've been added" notice without an invite link).

### 2. New page `src/pages/AcceptInvite.tsx` (route `/auth/accept-invite`)

- Public route. On mount, Supabase auto-parses the `#access_token` / `type=invite` hash and creates a session.
- Render a "Set your password" form → `supabase.auth.updateUser({ password })`.
- On success, redirect via `<RoleBasedRedirect />` (or push to `/`).

### 3. `src/App.tsx`

- Register the new public route `/auth/accept-invite` → `AcceptInvite`.

### 4. (Optional cleanup) `src/pages/Auth.tsx`

- No changes required for the bug fix. We can leave the existing signup tab working for self-serve owner signups; only invited users will go through the new accept-invite page.

## What this does NOT change

- No DB schema or RLS changes.
- No change to role assignment / driver linking logic — those still happen inside `invite-user` at invite-send time.
- No change to existing successfully-onboarded users.

## Note on the already-broken account

`ajb06.jrb07@gmail.com` was already deleted in the previous turn and re-invited; it is now stuck in the same broken state. After deploying the fix, the simplest recovery is: delete that auth row again and re-send the invite, which will then arrive with a working set-password link.
