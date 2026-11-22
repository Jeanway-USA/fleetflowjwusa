DROP POLICY IF EXISTS "Maintenance can upload invoices for reading" ON storage.objects;
CREATE POLICY "Maintenance can upload invoices for reading"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (storage.foldername(name))[2] = 'temp-invoice'
  AND public.has_role(auth.uid(), 'maintenance'::app_role)
);