-- Tighten documents bucket UPDATE/DELETE: only uploader (owner column) or org owner
DROP POLICY IF EXISTS "Org members can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Documents update by uploader or owner" ON storage.objects;
DROP POLICY IF EXISTS "Documents delete by uploader or owner" ON storage.objects;

CREATE POLICY "Documents update by uploader or owner"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (owner = auth.uid() OR public.is_owner(auth.uid()))
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (owner = auth.uid() OR public.is_owner(auth.uid()))
);

CREATE POLICY "Documents delete by uploader or owner"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (public.get_user_org_id(auth.uid()))::text
  AND (owner = auth.uid() OR public.is_owner(auth.uid()))
);