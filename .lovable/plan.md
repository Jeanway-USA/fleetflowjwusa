# Profiles RLS Audit & Rewrite

Confirmed scope: **owner = all profiles in their own org only**. Cross-tenant remains `super_admin` only. Tenant isolation preserved.

## Final role mapping

| Capability | Roles |
|---|---|
| Read own profile | every authenticated user |
| Insert own profile on signup (no `org_id` yet) | self |
| Update own profile (cannot change `org_id`) | self |
| Read all profiles in same org | `owner`, `dispatcher`, `maintenance`, `safety` |
| Update all profiles in same org | `owner` |
| Delete profiles in same org (cannot self-delete) | `owner` |
| Cross-tenant read / update / delete | `super_admin` |

`payroll_admin` and `driver` fall back to self-only on profiles. Flag if finance/driver flows need broader read.

## Migration (single transaction)

Drops all 6 existing `public.profiles` policies and installs an explicit, named set.

```sql
DROP POLICY IF EXISTS "Users can view their own profile"             ON public.profiles;
DROP POLICY IF EXISTS "Admins can view org profiles"                 ON public.profiles;
DROP POLICY IF EXISTS "Operations can view org profiles"             ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile on signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"           ON public.profiles;
DROP POLICY IF EXISTS "Owners can update org profiles"               ON public.profiles;

-- SELECT
CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_select_org_staff"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'dispatcher')
      OR public.has_role(auth.uid(), 'maintenance')
      OR public.has_role(auth.uid(), 'safety')
    )
  );

CREATE POLICY "profiles_select_super_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- INSERT (signup only)
CREATE POLICY "profiles_insert_self_signup"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND org_id IS NULL);

-- UPDATE
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND org_id IS NOT DISTINCT FROM public.get_user_org_id(auth.uid())
  );

CREATE POLICY "profiles_update_owner"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_owner(auth.uid())
    AND org_id = public.get_user_org_id(auth.uid())
  )
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "profiles_update_super_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- DELETE
CREATE POLICY "profiles_delete_owner"
  ON public.profiles FOR DELETE TO authenticated
  USING (
    public.is_owner(auth.uid())
    AND org_id = public.get_user_org_id(auth.uid())
    AND user_id <> auth.uid()
  );

CREATE POLICY "profiles_delete_super_admin"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_super_admin());
```

## Notes

- Uses existing security-definer helpers (`has_role`, `is_owner`, `get_user_org_id`, `is_super_admin`) — no recursion risk on `profiles`.
- All policies scoped `TO authenticated`; `anon` gets nothing.
- Deleting a profile row does **not** delete the `auth.users` account. Full account deletion is an edge-function admin task — out of scope here; tell me if you want it added.
- No application code changes required — existing queries already go through these helpers or self-scoped paths.
- After approval I'll run the migration and verify with the Supabase linter.
