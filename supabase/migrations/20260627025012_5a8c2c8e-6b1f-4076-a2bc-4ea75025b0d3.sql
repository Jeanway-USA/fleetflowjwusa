-- Scope tax-documents admin storage policies to caller's org via tax_documents table lookup.
DROP POLICY IF EXISTS "tax-documents: admins read" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins insert" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins update" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins delete" ON storage.objects;

CREATE POLICY "tax-documents: admins read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND (
    -- Path is {driver_user_id}/{tax_year}/{uuid}.pdf
    -- Match driver_user_id to a driver in caller's org
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.user_id::text = (storage.foldername(name))[1]
        AND d.org_id = public.get_user_org_id(auth.uid())
    )
  )
);

CREATE POLICY "tax-documents: admins insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "tax-documents: admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "tax-documents: admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);
