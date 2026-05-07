
-- 1. Harden user_roles policies: drop the ALL policy applied to public, replace with per-command authenticated-only policies
DROP POLICY IF EXISTS "Owners can manage org roles" ON public.user_roles;

CREATE POLICY "Owners can insert org roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Owners can update org roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Owners can delete org roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()));

-- 2. Make internal_config's locked-down posture explicit with a deny-all restrictive policy
--    (RLS already enabled, no permissive policies; SECURITY DEFINER funcs continue to work)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Deny all client access' AND polrelid = 'public.internal_config'::regclass
  ) THEN
    CREATE POLICY "Deny all client access"
      ON public.internal_config
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;
