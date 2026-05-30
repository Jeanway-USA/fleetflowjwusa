-- Remove DVIR photo DELETE policy (FMCSA immutability)
DROP POLICY IF EXISTS "Drivers can delete their own DVIR photos" ON storage.objects;

-- Tighten documents bucket SELECT to uploader or privileged roles
DROP POLICY IF EXISTS "Org members can view documents" ON storage.objects;
CREATE POLICY "Org members can view documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND (
    owner = auth.uid()
    OR is_owner(auth.uid())
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'safety'::app_role)
    OR has_role(auth.uid(), 'payroll_admin'::app_role)
  )
);

-- Tighten INSERT to require privileged role or own upload context
DROP POLICY IF EXISTS "Org-scoped document uploads" ON storage.objects;
CREATE POLICY "Org-scoped document uploads"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND (
    is_owner(auth.uid())
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'safety'::app_role)
    OR has_role(auth.uid(), 'payroll_admin'::app_role)
  )
);