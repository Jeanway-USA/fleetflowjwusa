
-- =========================================================================
-- 1) tax_documents — standardize driver_id to drivers.id (matches other tables)
-- =========================================================================
DROP POLICY IF EXISTS "Drivers read own tax documents" ON public.tax_documents;
DROP POLICY IF EXISTS "Admins insert tax documents" ON public.tax_documents;

CREATE POLICY "Drivers read own tax documents"
  ON public.tax_documents
  FOR SELECT
  TO authenticated
  USING (driver_id = public.get_driver_id_for_user(auth.uid()));

CREATE POLICY "Admins insert tax documents"
  ON public.tax_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_admin_access(auth.uid())
    AND org_id = public.get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = tax_documents.driver_id
        AND d.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- =========================================================================
-- 2) load_intermediate_stops — restrict writes to owner/dispatcher/safety
-- =========================================================================
DROP POLICY IF EXISTS "Org members can insert load stops" ON public.load_intermediate_stops;
DROP POLICY IF EXISTS "Org members can update load stops" ON public.load_intermediate_stops;
DROP POLICY IF EXISTS "Org members can delete load stops" ON public.load_intermediate_stops;

CREATE POLICY "Dispatchers manage load stops - insert"
  ON public.load_intermediate_stops
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  );

CREATE POLICY "Dispatchers manage load stops - update"
  ON public.load_intermediate_stops
  FOR UPDATE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  );

CREATE POLICY "Dispatchers manage load stops - delete"
  ON public.load_intermediate_stops
  FOR DELETE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  );

-- =========================================================================
-- 3) manufacturer_pm_profiles — require authenticated user with an org
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view manufacturer profiles" ON public.manufacturer_pm_profiles;

CREATE POLICY "Org members can view manufacturer profiles"
  ON public.manufacturer_pm_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id IS NOT NULL
    )
  );
