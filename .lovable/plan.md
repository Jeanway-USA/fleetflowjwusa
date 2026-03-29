

## Fix: Ambiguous `super_admin_update_org` RPC Overload

### Problem
There are two versions of the `super_admin_update_org` function in the database:
1. One with 6 parameters (without `new_tms_mode`)
2. One with 7 parameters (with `new_tms_mode`)

When `OrgActionsDropdown` calls the RPC with only `target_org_id`, `new_trial_ends_at`, `new_is_complimentary`, and `new_complimentary_ends_at`, Postgres cannot disambiguate which overload to use because both accept those parameters as defaults.

### Solution

**Database migration**: Drop the older 6-parameter overload, keeping only the 7-parameter version (which has `new_tms_mode` defaulting to `NULL`).

```sql
DROP FUNCTION public.super_admin_update_org(uuid, text, boolean, timestamptz, boolean, timestamptz);
```

This is safe because the 7-parameter version already defaults `new_tms_mode` to `NULL`, so all existing call sites work unchanged.

### Files
| File | Action |
|------|--------|
| Migration SQL | Drop the old 6-param overload of `super_admin_update_org` |

No frontend changes needed.

