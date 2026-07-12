## Root cause

The `public.handle_new_user()` function still exists in the database, but its trigger on `auth.users` is gone (verified: `information_schema.triggers` returns 0 rows for `auth.users`). Every time a new user is created — invite, signup, OAuth — Postgres is supposed to fire `on_auth_user_created` and insert a matching row into `public.profiles`. With the trigger missing:

- No `profiles` row is created for the new auth user.
- The `invite-user` edge function's follow-up `UPDATE profiles SET org_id = …` is a silent no-op (nothing to update).
- The driver's card in Fleet → Drivers therefore has no profile linked to the email, and downstream lookups (org_id, `requires_onboarding`, first/last name, etc.) all fail.

This matches exactly what you're seeing: driver got invited, but no profile card was linked.

## Fix

1. **Recreate the missing trigger** on `auth.users` so all future invites/signups auto-create a profile:
   ```
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```
   The function body is already correct — it inserts `user_id`, `first_name`, `last_name`, `email`, `requires_onboarding` and safely `ON CONFLICT (user_id) DO UPDATE`.

2. **Backfill any auth users missing a profile row** (covers the driver you just invited and anyone else created while the trigger was missing):
   - For every `auth.users` id with no matching `public.profiles.user_id`, insert a profile using the auth user's email and `raw_user_meta_data` (first_name, last_name, requires_onboarding).
   - Then, for each of those backfilled profiles, if the user has an `invitations` row (pending or accepted) with an `org_id`, set `profiles.org_id` to that org so the driver correctly resolves under the inviting organization.
   - For driver-role users, also ensure the matching `drivers` row has `user_id` set (invite-user already tries to do this; this is a safety net).

3. **Verification after migration runs**:
   - Re-check `information_schema.triggers` shows `on_auth_user_created` on `auth.users`.
   - Confirm the specific driver you just invited now has a `profiles` row with the correct `org_id` and email.
   - Send a fresh test invite to a throwaway address and verify a profile row appears immediately.

## Out of scope

- No changes to the `invite-user` edge function itself — its logic is correct; it just needs the trigger to do its job.
- No schema changes to `profiles`, `drivers`, or `invitations`.
- No RLS policy changes.

## Technical notes

- Migration will be a single SQL file: `CREATE TRIGGER` + backfill `INSERT … SELECT` + targeted `UPDATE` for org linkage.
- The trigger uses `SECURITY DEFINER` and already sets `search_path`, so no additional hardening needed.
- Backfill is idempotent (uses `ON CONFLICT (user_id) DO NOTHING` for the insert and `WHERE org_id IS NULL` for the org update), so it's safe to re-run.
