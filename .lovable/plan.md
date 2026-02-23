

## Fix: Drop Duplicate `super_admin_update_org` Function

### Problem
The database has two versions of `super_admin_update_org`:
1. **Old (4 params):** `target_org_id`, `new_tier`, `new_is_active`, `new_trial_ends_at`
2. **New (6 params):** Same as above plus `new_is_complimentary`, `new_complimentary_ends_at`

When the frontend calls the RPC, Postgres cannot determine which overload to use and throws an ambiguity error.

### Fix
A single database migration that drops the old 4-parameter function. The newer 6-parameter version already handles all cases (the extra params default to `NULL` so existing calls still work).

```sql
DROP FUNCTION IF EXISTS public.super_admin_update_org(uuid, text, boolean, timestamptz);
```

No frontend changes needed.
