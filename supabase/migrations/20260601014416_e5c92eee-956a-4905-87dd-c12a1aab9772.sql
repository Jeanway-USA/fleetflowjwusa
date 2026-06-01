-- Tighten DVIR storage INSERT policies to enforce org_id binding via path segment
DROP POLICY IF EXISTS "Drivers can upload org-scoped DVIR photos" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload org-scoped DVIR signatures" ON storage.objects;

CREATE POLICY "Drivers can upload org-scoped DVIR photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'dvir-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
);

CREATE POLICY "Drivers can upload org-scoped DVIR signatures"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'dvir-signatures'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
);

-- Allow drivers to read witnesses they submitted for their own incidents
CREATE POLICY "Drivers can view witnesses for their incidents"
ON public.incident_witnesses
FOR SELECT
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id = incident_witnesses.incident_id
      AND i.driver_id = public.get_driver_id_for_user(auth.uid())
  )
);
