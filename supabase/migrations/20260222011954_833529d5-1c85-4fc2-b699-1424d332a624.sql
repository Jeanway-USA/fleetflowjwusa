DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);