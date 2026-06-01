-- Tighten driver DVIR storage SELECT policies to also enforce org membership via the path's second folder (org_id),
-- adding defense-in-depth on top of the existing auth.uid match on the first folder.

DROP POLICY IF EXISTS "Drivers can view their own DVIR photos" ON storage.objects;
CREATE POLICY "Drivers can view their own DVIR photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
);

DROP POLICY IF EXISTS "Drivers can view their own DVIR signatures" ON storage.objects;
CREATE POLICY "Drivers can view their own DVIR signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
);