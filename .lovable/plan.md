

## Clean Up Orphaned Auth Users and Harden Onboarding

### Problem
Two auth accounts (`etwgaming123@gmail.com` and `zestyclan11@gmail.com`) exist in the authentication system but have no `profiles` row. Their profiles were likely deleted when their old organizations were removed, but the auth accounts were left behind.

When these users try to onboard:
1. `create_onboarding_org` creates a new organization successfully
2. The `UPDATE profiles SET org_id` silently affects 0 rows (no profile exists)
3. The `user_roles` insert may succeed, but without a profile the app can't determine their org
4. Result: orphaned org, user stuck in a broken state

### Fix (2 parts)

**1. Delete the two orphaned auth accounts**

Use the `delete-user` edge function approach but via a database migration that cleans up these specific users. Since they have no profiles or roles, we just need to delete them from `auth.users`. They can re-register fresh.

A migration will call `auth.admin_delete_user()` — however, since we can't call admin auth APIs from SQL, the cleanest approach is to use an edge function. We'll create a small one-time cleanup edge function, or better: since the users have no data, we can delete them via a super-admin action in the app.

**Actually, the simplest approach**: Add a database migration that inserts profiles for these users so they can onboard properly. But since you want them fully removed, I'll delete them from `auth.users` using an edge function call.

**Revised approach — Migration to delete from auth.users:**
We cannot delete from `auth.users` via a migration (it's a reserved schema). Instead, I will:
- Create a small temporary edge function (`cleanup-orphaned-users`) that uses the service role key to delete these two specific auth users by ID
- Call it once, then remove it

**2. Harden `create_onboarding_org` to handle missing profiles**

Update the function so that if the `UPDATE profiles` affects 0 rows, it creates the profile row instead. This prevents the bug from recurring.

```sql
-- Inside create_onboarding_org, replace the UPDATE with:
UPDATE public.profiles SET org_id = _org_id WHERE user_id = _user_id;
IF NOT FOUND THEN
  INSERT INTO public.profiles (user_id, email, org_id)
  VALUES (_user_id, (SELECT email FROM auth.users WHERE id = _user_id), _org_id);
END IF;
```

### Files to create/modify
- **New (temporary)**: `supabase/functions/cleanup-orphaned-users/index.ts` — one-time edge function to delete the two orphaned auth users
- **Migration**: Update `create_onboarding_org` function to create a profile if one doesn't exist during onboarding

### Result
- The two broken accounts are fully removed; those emails can re-register fresh
- Future cases where a profile is missing won't break onboarding
