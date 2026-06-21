DROP POLICY IF EXISTS "Org owners can update their org" ON public.organizations;
CREATE POLICY "Org owners can update their org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()))
WITH CHECK (id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()));