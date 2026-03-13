

## Plan: Fix Super Admin Organizations View

### Problem
The `super_admin_organizations` view was recreated with `security_invoker = true` in a recent migration. This causes the view to respect RLS policies on the `organizations` table, which only allows users to see their own org (`id = get_user_org_id(auth.uid())`). So the super admin only sees JeanWay USA (their own org) instead of all organizations.

### Fix
Run a migration to recreate the view with `security_invoker = false` (security definer mode), so it bypasses RLS on the underlying `organizations` table. The view already self-gates via the `WHERE is_super_admin()` clause, so access control is maintained.

```sql
DROP VIEW IF EXISTS public.super_admin_organizations;
CREATE VIEW public.super_admin_organizations
WITH (security_invoker = false)
AS SELECT id, name, subscription_tier, created_at, trial_ends_at, is_active,
          primary_color, logo_url, banner_url, is_complimentary, complimentary_ends_at,
          (SELECT count(*)::integer FROM profiles p WHERE p.org_id = o.id) AS user_count
   FROM organizations o
   WHERE is_super_admin();

REVOKE ALL ON public.super_admin_organizations FROM anon, public;
GRANT SELECT ON public.super_admin_organizations TO authenticated;
```

### Files
- 1 database migration only, no code changes needed

