
-- ============================================================================
-- I-9 Form
-- ============================================================================
CREATE TABLE public.driver_i9_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  other_last_names text,
  address text NOT NULL,
  dob date NOT NULL,
  ssn_encrypted bytea,
  ssn_last4 text,
  email text NOT NULL,
  phone text NOT NULL,
  citizenship text NOT NULL CHECK (citizenship IN ('citizen','national','permanent_resident','authorized_alien')),
  alien_number text,
  work_auth_expiry date,
  work_auth_doc_number text,
  attested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, driver_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_i9_info TO authenticated;
GRANT ALL ON public.driver_i9_info TO service_role;

ALTER TABLE public.driver_i9_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY i9_read_own_or_admin ON public.driver_i9_info
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_payroll_access(auth.uid()) OR driver_id = get_driver_id_for_user(auth.uid()))
  );

CREATE POLICY i9_write_admin ON public.driver_i9_info
  FOR ALL USING (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  ) WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  );

CREATE TRIGGER trg_driver_i9_info_updated_at
  BEFORE UPDATE ON public.driver_i9_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- W-9 Form
-- ============================================================================
CREATE TABLE public.driver_w9_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  business_name text,
  tax_class text NOT NULL,
  address text NOT NULL,
  tin_type text NOT NULL CHECK (tin_type IN ('ssn','ein')),
  tin_encrypted bytea,
  tin_last4 text,
  certify_accurate boolean NOT NULL DEFAULT false,
  certify_backup_withholding boolean NOT NULL DEFAULT false,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, driver_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_w9_info TO authenticated;
GRANT ALL ON public.driver_w9_info TO service_role;

ALTER TABLE public.driver_w9_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY w9_read_own_or_admin ON public.driver_w9_info
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_payroll_access(auth.uid()) OR driver_id = get_driver_id_for_user(auth.uid()))
  );

CREATE POLICY w9_write_admin ON public.driver_w9_info
  FOR ALL USING (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  ) WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  );

CREATE TRIGGER trg_driver_w9_info_updated_at
  BEFORE UPDATE ON public.driver_w9_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Independent Owner-Operator Agreement
-- ============================================================================
CREATE TABLE public.driver_ioo_agreement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  business_name text,
  mc_number text NOT NULL,
  dot_number text NOT NULL,
  effective_date date NOT NULL,
  agree_terms boolean NOT NULL DEFAULT false,
  ack_ic_status boolean NOT NULL DEFAULT false,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, driver_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_ioo_agreement TO authenticated;
GRANT ALL ON public.driver_ioo_agreement TO service_role;

ALTER TABLE public.driver_ioo_agreement ENABLE ROW LEVEL SECURITY;

CREATE POLICY ioo_read_own_or_admin ON public.driver_ioo_agreement
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_payroll_access(auth.uid()) OR driver_id = get_driver_id_for_user(auth.uid()))
  );

CREATE POLICY ioo_write_admin ON public.driver_ioo_agreement
  FOR ALL USING (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  ) WITH CHECK (
    org_id = get_user_org_id(auth.uid()) AND has_payroll_access(auth.uid())
  );

CREATE TRIGGER trg_driver_ioo_agreement_updated_at
  BEFORE UPDATE ON public.driver_ioo_agreement
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RPCs (SECURITY DEFINER) so drivers can save their own onboarding forms.
-- Mirrors the pattern established by public.upsert_driver_banking.
-- ============================================================================

-- W-4
CREATE OR REPLACE FUNCTION public.upsert_driver_w4(
  _driver_id uuid,
  _filing_status text,
  _multiple_jobs boolean,
  _dependents_amount numeric,
  _other_income numeric,
  _deductions numeric,
  _extra_withholding numeric,
  _step_2c_checkbox boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _org_id uuid;
  _is_admin boolean;
  _is_self boolean;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));
  IF NOT (_is_admin OR _is_self) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  INSERT INTO public.driver_w4_info AS w (
    org_id, driver_id, filing_status, multiple_jobs, dependents_amount,
    other_income, deductions, extra_withholding, step_2c_checkbox
  ) VALUES (
    _org_id, _driver_id, _filing_status, COALESCE(_multiple_jobs, false),
    COALESCE(_dependents_amount, 0), COALESCE(_other_income, 0),
    COALESCE(_deductions, 0), COALESCE(_extra_withholding, 0),
    COALESCE(_step_2c_checkbox, false)
  )
  ON CONFLICT (driver_id) DO UPDATE
    SET filing_status = EXCLUDED.filing_status,
        multiple_jobs = EXCLUDED.multiple_jobs,
        dependents_amount = EXCLUDED.dependents_amount,
        other_income = EXCLUDED.other_income,
        deductions = EXCLUDED.deductions,
        extra_withholding = EXCLUDED.extra_withholding,
        step_2c_checkbox = EXCLUDED.step_2c_checkbox,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- Some environments may lack a unique constraint on driver_w4_info.driver_id.
-- Add one defensively so ON CONFLICT resolves.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'driver_w4_info'
      AND indexdef ILIKE '%UNIQUE%(driver_id)%'
  ) THEN
    BEGIN
      ALTER TABLE public.driver_w4_info ADD CONSTRAINT driver_w4_info_driver_id_key UNIQUE (driver_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- I-9
CREATE OR REPLACE FUNCTION public.upsert_driver_i9(
  _driver_id uuid,
  _full_name text,
  _other_last_names text,
  _address text,
  _dob date,
  _ssn text,
  _email text,
  _phone text,
  _citizenship text,
  _alien_number text,
  _work_auth_expiry date,
  _work_auth_doc_number text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _org_id uuid;
  _is_admin boolean;
  _is_self boolean;
  _id uuid;
  _key text;
  _digits text;
  _last4 text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));
  IF NOT (_is_admin OR _is_self) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;

  _digits := regexp_replace(COALESCE(_ssn, ''), '\D', '', 'g');
  _last4 := CASE WHEN length(_digits) >= 4 THEN right(_digits, 4) ELSE NULL END;

  INSERT INTO public.driver_i9_info AS x (
    org_id, driver_id, full_name, other_last_names, address, dob,
    ssn_encrypted, ssn_last4, email, phone, citizenship,
    alien_number, work_auth_expiry, work_auth_doc_number
  ) VALUES (
    _org_id, _driver_id, _full_name, NULLIF(_other_last_names,''), _address, _dob,
    CASE WHEN _digits = '' THEN NULL ELSE pgp_sym_encrypt(_digits, _key) END,
    _last4, _email, _phone, _citizenship,
    NULLIF(_alien_number,''), _work_auth_expiry, NULLIF(_work_auth_doc_number,'')
  )
  ON CONFLICT (org_id, driver_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        other_last_names = EXCLUDED.other_last_names,
        address = EXCLUDED.address,
        dob = EXCLUDED.dob,
        ssn_encrypted = COALESCE(EXCLUDED.ssn_encrypted, x.ssn_encrypted),
        ssn_last4 = COALESCE(EXCLUDED.ssn_last4, x.ssn_last4),
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        citizenship = EXCLUDED.citizenship,
        alien_number = EXCLUDED.alien_number,
        work_auth_expiry = EXCLUDED.work_auth_expiry,
        work_auth_doc_number = EXCLUDED.work_auth_doc_number,
        attested_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- W-9
CREATE OR REPLACE FUNCTION public.upsert_driver_w9(
  _driver_id uuid,
  _legal_name text,
  _business_name text,
  _tax_class text,
  _address text,
  _tin_type text,
  _tin text,
  _certify_accurate boolean,
  _certify_backup_withholding boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _org_id uuid;
  _is_admin boolean;
  _is_self boolean;
  _id uuid;
  _key text;
  _digits text;
  _last4 text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));
  IF NOT (_is_admin OR _is_self) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;

  _digits := regexp_replace(COALESCE(_tin, ''), '\D', '', 'g');
  _last4 := CASE WHEN length(_digits) >= 4 THEN right(_digits, 4) ELSE NULL END;

  INSERT INTO public.driver_w9_info AS x (
    org_id, driver_id, legal_name, business_name, tax_class, address,
    tin_type, tin_encrypted, tin_last4, certify_accurate, certify_backup_withholding
  ) VALUES (
    _org_id, _driver_id, _legal_name, NULLIF(_business_name,''), _tax_class, _address,
    _tin_type,
    CASE WHEN _digits = '' THEN NULL ELSE pgp_sym_encrypt(_digits, _key) END,
    _last4, COALESCE(_certify_accurate,false), COALESCE(_certify_backup_withholding,false)
  )
  ON CONFLICT (org_id, driver_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        tax_class = EXCLUDED.tax_class,
        address = EXCLUDED.address,
        tin_type = EXCLUDED.tin_type,
        tin_encrypted = COALESCE(EXCLUDED.tin_encrypted, x.tin_encrypted),
        tin_last4 = COALESCE(EXCLUDED.tin_last4, x.tin_last4),
        certify_accurate = EXCLUDED.certify_accurate,
        certify_backup_withholding = EXCLUDED.certify_backup_withholding,
        signed_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- IOO
CREATE OR REPLACE FUNCTION public.upsert_driver_ioo(
  _driver_id uuid,
  _legal_name text,
  _business_name text,
  _mc_number text,
  _dot_number text,
  _effective_date date,
  _agree_terms boolean,
  _ack_ic_status boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _org_id uuid;
  _is_admin boolean;
  _is_self boolean;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));
  IF NOT (_is_admin OR _is_self) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  INSERT INTO public.driver_ioo_agreement AS x (
    org_id, driver_id, legal_name, business_name, mc_number, dot_number,
    effective_date, agree_terms, ack_ic_status
  ) VALUES (
    _org_id, _driver_id, _legal_name, NULLIF(_business_name,''), _mc_number, _dot_number,
    _effective_date, COALESCE(_agree_terms,false), COALESCE(_ack_ic_status,false)
  )
  ON CONFLICT (org_id, driver_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        mc_number = EXCLUDED.mc_number,
        dot_number = EXCLUDED.dot_number,
        effective_date = EXCLUDED.effective_date,
        agree_terms = EXCLUDED.agree_terms,
        ack_ic_status = EXCLUDED.ack_ic_status,
        signed_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_driver_w4(uuid,text,boolean,numeric,numeric,numeric,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_driver_i9(uuid,text,text,text,date,text,text,text,text,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_driver_w9(uuid,text,text,text,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_driver_ioo(uuid,text,text,text,text,date,boolean,boolean) TO authenticated;
