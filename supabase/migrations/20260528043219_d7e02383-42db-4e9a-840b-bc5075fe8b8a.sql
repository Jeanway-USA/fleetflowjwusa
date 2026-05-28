DROP POLICY IF EXISTS "Users can view their own profile"             ON public.profiles;
DROP POLICY IF EXISTS "Admins can view org profiles"                 ON public.profiles;
DROP POLICY IF EXISTS "Operations can view org profiles"             ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile on signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"           ON public.profiles;
DROP POLICY IF EXISTS "Owners can update org profiles"               ON public.profiles;

CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_select_org_staff"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'maintenance'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  );

CREATE POLICY "profiles_select_super_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "profiles_insert_self_signup"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND org_id IS NULL);

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