
-- Tighten documents INSERT policy: drivers may only attach load-type docs to their assigned loads
DROP POLICY IF EXISTS "Users can upload their own documents" ON public.documents;

CREATE POLICY "Users can upload their own documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND org_id = public.get_user_org_id(auth.uid())
  AND (
    -- Operations staff: unrestricted (within their org)
    public.has_operations_access(auth.uid())
    -- Non-load documents: any user can attach to themselves (e.g. profile docs)
    OR related_type <> 'load'
    -- Load documents: must be a load currently assigned to this driver
    OR (
      related_type = 'load'
      AND EXISTS (
        SELECT 1 FROM public.fleet_loads fl
        WHERE fl.id = documents.related_id
          AND fl.org_id = public.get_user_org_id(auth.uid())
          AND fl.driver_id = public.get_driver_id_for_user(auth.uid())
      )
    )
  )
);
