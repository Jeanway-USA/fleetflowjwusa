-- Shop receipts and photos (Nov 2026). Run once through Lovable. Safe to run again.
-- The shop's receipts, invoices and job photos are saved in the "documents" storage bucket under the organization's folder:
--   {organization id}/work-orders/{job id}/{file}
-- The rules for that bucket let the owner, dispatcher, safety and payroll roles upload and view files, but not the maintenance role,
-- so a mechanic could not add a photo or an invoice to a job. This lets the maintenance role upload and view files in the work-orders
-- folder of their own organization, and nothing else in the bucket. It removes nothing and changes no one else's access.

DROP POLICY IF EXISTS "Maintenance can upload shop files" ON storage.objects;
CREATE POLICY "Maintenance can upload shop files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (storage.foldername(name))[2] = 'work-orders'
  AND public.has_role(auth.uid(), 'maintenance'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view shop files" ON storage.objects;
CREATE POLICY "Maintenance can view shop files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (storage.foldername(name))[2] = 'work-orders'
  AND public.has_role(auth.uid(), 'maintenance'::app_role)
);