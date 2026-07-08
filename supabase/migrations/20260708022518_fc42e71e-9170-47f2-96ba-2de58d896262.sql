
CREATE POLICY "Owner payroll can upload completed signed documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
);

CREATE POLICY "Owner payroll can update completed signed documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
)
WITH CHECK (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
);
