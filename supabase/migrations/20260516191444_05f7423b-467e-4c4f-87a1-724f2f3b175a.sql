-- 1) Hide encrypted landstar_password from client SELECTs.
-- The column remains writable/readable by service-role (manage-credentials, landstar-fuel-stops).
REVOKE SELECT (landstar_password) ON public.driver_settings FROM anon, authenticated;

-- 2) Block any client-side INSERT/UPDATE/DELETE on audit_logs.
-- All audit writes happen via SECURITY DEFINER triggers/functions running as service role.
DROP POLICY IF EXISTS "No client writes to audit_logs" ON public.audit_logs;
CREATE POLICY "No client writes to audit_logs"
ON public.audit_logs
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 3) Allow authenticated users to read changelog entries (feature intent).
DROP POLICY IF EXISTS "Authenticated users can view changelog" ON public.changelog;
CREATE POLICY "Authenticated users can view changelog"
ON public.changelog
FOR SELECT
TO authenticated
USING (true);

-- 4) Tighten DVIR storage read access: drivers see only their own files;
--    owners and safety can see everything in their org.
DROP POLICY IF EXISTS "Org members can view dvir photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view dvir signatures" ON storage.objects;

CREATE POLICY "Drivers can view their own DVIR photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owners and safety can view org DVIR photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-photos'
  AND public.storage_user_same_org((storage.foldername(name))[1])
  AND (public.is_owner(auth.uid()) OR public.has_safety_access(auth.uid()))
);

CREATE POLICY "Drivers can view their own DVIR signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owners and safety can view org DVIR signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dvir-signatures'
  AND public.storage_user_same_org((storage.foldername(name))[1])
  AND (public.is_owner(auth.uid()) OR public.has_safety_access(auth.uid()))
);