-- Banking info table (encrypted at rest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Seed an encryption key in internal_config if missing
INSERT INTO public.internal_config (key, value)
VALUES ('banking_encryption_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.driver_banking_info (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  bank_name text,
  account_type text,
  routing_number_encrypted bytea,
  account_number_encrypted bytea,
  account_number_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, driver_id)
);

GRANT SELECT, INSERT, UPDATE ON public.driver_banking_info TO authenticated;
GRANT ALL ON public.driver_banking_info TO service_role;

ALTER TABLE public.driver_banking_info ENABLE ROW LEVEL SECURITY;

-- Owner + payroll admin can read metadata rows (decrypted access only via RPC)
CREATE POLICY "Owner payroll can view banking metadata"
ON public.driver_banking_info
FOR SELECT TO authenticated
USING (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = get_user_org_id(auth.uid())
);

-- Owner + payroll admin can manage rows
CREATE POLICY "Owner payroll can manage banking"
ON public.driver_banking_info
FOR ALL TO authenticated
USING (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = get_user_org_id(auth.uid())
);

-- Drivers can write/update their own row (but cannot SELECT decrypted via direct read; columns are bytea)
CREATE POLICY "Drivers can insert own banking"
ON public.driver_banking_info
FOR INSERT TO authenticated
WITH CHECK (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Drivers can update own banking"
ON public.driver_banking_info
FOR UPDATE TO authenticated
USING (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
);

CREATE INDEX idx_driver_banking_driver ON public.driver_banking_info(driver_id);
CREATE INDEX idx_driver_banking_org ON public.driver_banking_info(org_id);

CREATE TRIGGER update_driver_banking_info_updated_at
BEFORE UPDATE ON public.driver_banking_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Writer RPC: anyone (driver themself, owner, payroll) can upsert their banking info
CREATE OR REPLACE FUNCTION public.upsert_driver_banking(
  _driver_id uuid,
  _bank_name text,
  _account_type text,
  _routing_number text,
  _account_number text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _org_id uuid;
  _id uuid;
  _is_admin boolean;
  _is_self boolean;
  _last4 text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'No organization';
  END IF;

  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));

  IF NOT (_is_admin OR _is_self) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate driver belongs to same org
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  -- Sanitize
  _routing_number := regexp_replace(COALESCE(_routing_number, ''), '\D', '', 'g');
  _account_number := regexp_replace(COALESCE(_account_number, ''), '\D', '', 'g');
  IF length(_account_number) >= 4 THEN
    _last4 := right(_account_number, 4);
  ELSE
    _last4 := NULL;
  END IF;

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  INSERT INTO public.driver_banking_info AS dbi (
    org_id, driver_id, bank_name, account_type,
    routing_number_encrypted, account_number_encrypted, account_number_last4
  ) VALUES (
    _org_id, _driver_id, NULLIF(trim(_bank_name), ''), NULLIF(_account_type, ''),
    CASE WHEN _routing_number = '' THEN NULL ELSE pgp_sym_encrypt(_routing_number, _key) END,
    CASE WHEN _account_number = '' THEN NULL ELSE pgp_sym_encrypt(_account_number, _key) END,
    _last4
  )
  ON CONFLICT (org_id, driver_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name,
        account_type = EXCLUDED.account_type,
        routing_number_encrypted = COALESCE(EXCLUDED.routing_number_encrypted, dbi.routing_number_encrypted),
        account_number_encrypted = COALESCE(EXCLUDED.account_number_encrypted, dbi.account_number_encrypted),
        account_number_last4 = COALESCE(EXCLUDED.account_number_last4, dbi.account_number_last4),
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_driver_banking(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_driver_banking(uuid, text, text, text, text) TO authenticated;

-- Reader RPC: only owner/payroll admin can decrypt and view
CREATE OR REPLACE FUNCTION public.get_driver_banking(_driver_id uuid)
RETURNS TABLE (
  bank_name text,
  account_type text,
  routing_number text,
  account_number text,
  account_number_last4 text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (auth.uid(), 'banking_decrypt_view', 'driver_banking_info', _driver_id,
          jsonb_build_object('driver_id', _driver_id), _org_id);

  RETURN QUERY
  SELECT
    dbi.bank_name,
    dbi.account_type,
    CASE WHEN dbi.routing_number_encrypted IS NOT NULL
         THEN pgp_sym_decrypt(dbi.routing_number_encrypted, _key) ELSE NULL END,
    CASE WHEN dbi.account_number_encrypted IS NOT NULL
         THEN pgp_sym_decrypt(dbi.account_number_encrypted, _key) ELSE NULL END,
    dbi.account_number_last4,
    dbi.updated_at
  FROM public.driver_banking_info dbi
  WHERE dbi.driver_id = _driver_id
    AND dbi.org_id = _org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_banking(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_banking(uuid) TO authenticated;

-- Tighten direct_deposit PDF visibility: safety no longer sees direct_deposit signed docs.
DROP POLICY IF EXISTS "Owner safety payroll can view org signed documents" ON public.driver_signed_documents;

CREATE POLICY "Owner payroll can view org signed documents"
ON public.driver_signed_documents
FOR SELECT TO authenticated
USING (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Safety can view non-banking signed documents"
ON public.driver_signed_documents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role)
  AND org_id = get_user_org_id(auth.uid())
  AND document_type <> 'direct_deposit'
);

-- Storage policy: safety can read signed-documents EXCEPT direct_deposit files
DROP POLICY IF EXISTS "Owner safety payroll can read org signed documents" ON storage.objects;

CREATE POLICY "Owner payroll can read org signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
);

CREATE POLICY "Safety can read non-banking signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND has_role(auth.uid(), 'safety'::app_role)
  AND position('direct_deposit' in name) = 0
);
