-- 1) Decrypt RPCs for SSN and TIN (owner + payroll_admin only), with audit logging.

CREATE OR REPLACE FUNCTION public.get_driver_ssn(_driver_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _org_id uuid;
  _ssn text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  _org_id := get_user_org_id(auth.uid());

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (auth.uid(), 'ssn_decrypt_view', 'driver_i9_info', _driver_id,
          jsonb_build_object('driver_id', _driver_id), _org_id);

  SELECT CASE
           WHEN i9.ssn_encrypted IS NOT NULL
             THEN pgp_sym_decrypt(i9.ssn_encrypted, _key)
           ELSE NULL
         END
    INTO _ssn
    FROM public.driver_i9_info i9
   WHERE i9.driver_id = _driver_id
     AND i9.org_id = _org_id
   LIMIT 1;

  RETURN _ssn;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_ssn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_ssn(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_driver_tin(_driver_id uuid)
RETURNS TABLE(tin text, tin_type text, legal_name text, business_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  _org_id := get_user_org_id(auth.uid());

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (auth.uid(), 'tin_decrypt_view', 'driver_w9_info', _driver_id,
          jsonb_build_object('driver_id', _driver_id), _org_id);

  RETURN QUERY
  SELECT
    CASE WHEN w9.tin_encrypted IS NOT NULL
         THEN pgp_sym_decrypt(w9.tin_encrypted, _key) ELSE NULL END,
    w9.tin_type,
    w9.legal_name,
    w9.business_name
  FROM public.driver_w9_info w9
  WHERE w9.driver_id = _driver_id
    AND w9.org_id = _org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_tin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_tin(uuid) TO authenticated, service_role;


-- 2) driver_signed_documents.admin_file_path for the unmasked admin copy
ALTER TABLE public.driver_signed_documents
  ADD COLUMN IF NOT EXISTS admin_file_path text;


-- 3) Storage RLS: keep drivers and safety out of *.full.pdf, allow owner/payroll.
--    Existing "Owner payroll can read org signed documents" already covers *.full.pdf.
--    We restrict driver + safety policies to non-full copies.

DROP POLICY IF EXISTS "Drivers can read their own signed documents" ON storage.objects;
CREATE POLICY "Drivers can read their own signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = get_driver_id_for_user(auth.uid())::text
  AND name NOT LIKE '%.full.pdf'
);

DROP POLICY IF EXISTS "Safety can read non-banking signed documents" ON storage.objects;
CREATE POLICY "Safety can read non-banking signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND has_role(auth.uid(), 'safety'::app_role)
  AND position('direct_deposit' in name) = 0
  AND name NOT LIKE '%.full.pdf'
);