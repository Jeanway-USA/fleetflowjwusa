

## Fix: Organization creation fails because SELECT policy blocks read-back

### Problem
The INSERT into `organizations` now succeeds (the permissive policy fix worked), but the Supabase client call chains `.select('id').single()` after the insert to get the new org's ID. This triggers the SELECT policy:

```
id = get_user_org_id(auth.uid())
```

At this point, the user's profile doesn't have `org_id` set yet, so `get_user_org_id()` returns NULL and the SELECT fails -- making the whole operation appear to error.

### Solution
Create a `SECURITY DEFINER` database function that handles all three onboarding operations atomically:
1. Create the organization
2. Link the user's profile to the new org
3. Assign the "owner" role

This avoids the RLS chicken-and-egg problem entirely and returns the new org ID.

### Technical Details

**Database migration -- create function:**
```sql
CREATE OR REPLACE FUNCTION public.create_onboarding_org(
  _name text,
  _tier text DEFAULT 'solo_bco'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create org
  INSERT INTO public.organizations (name, subscription_tier)
  VALUES (_name, _tier)
  RETURNING id INTO _org_id;

  -- Link profile
  UPDATE public.profiles
  SET org_id = _org_id
  WHERE user_id = _user_id;

  -- Assign owner role
  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (_user_id, 'owner', _org_id);

  RETURN _org_id;
END;
$$;
```

**`src/pages/Onboarding.tsx`** -- simplify `handleStep1`:
- Replace the three separate Supabase calls (insert org, update profile, insert role) with a single RPC call:
  ```typescript
  const { data: newOrgId, error } = await supabase.rpc('create_onboarding_org', {
    _name: companyName.trim(),
  });
  ```
- Remove the profile update and role insert code since the function handles both
- Set `orgId` from the returned value

This makes onboarding reliable regardless of RLS policy ordering.
