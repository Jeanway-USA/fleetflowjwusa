

## Fix: "Failed to create organization" — Duplicate Role Conflict

### Root Cause
The `create_onboarding_org` database function fails with a **409 conflict** because this user (`andrew@jeanwayusa.com`) already has an `owner` role in `user_roles` — inserted earlier by the `invite-user` edge function. The function does a plain `INSERT INTO user_roles` which violates the `user_roles_user_id_role_key` unique constraint.

### Solution
Update the `create_onboarding_org` function to use `ON CONFLICT DO UPDATE` for the `user_roles` insert, so it gracefully handles users who already have a role assigned (e.g., from a prior invite or failed onboarding attempt). The upsert will update the `org_id` to the new organization.

### Database Migration

```sql
CREATE OR REPLACE FUNCTION public.create_onboarding_org(_name text, _tier text DEFAULT 'solo_bco'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.organizations (name, subscription_tier)
  VALUES (_name, _tier)
  RETURNING id INTO _org_id;

  UPDATE public.profiles
  SET org_id = _org_id
  WHERE user_id = _user_id;

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (_user_id, 'owner', _org_id)
  ON CONFLICT (user_id, role) DO UPDATE SET org_id = _org_id;

  RETURN _org_id;
END;
$$;
```

### Files
| File | Change |
|------|--------|
| New migration SQL | Replace `create_onboarding_org` with conflict-safe upsert |

No frontend changes needed.

