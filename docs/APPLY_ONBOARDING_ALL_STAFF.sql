-- Onboarding for all staff, and the hire-plan fixes.
-- Run once in the Supabase SQL editor (or through Lovable) after the matching code is merged. Safe to run twice.
-- Additive only: nothing here deletes or rewrites existing rows, except one clearly marked backfill of two columns.
--
-- Part 1  Who decides W-2 or 1099: the office, set on the position, the hire plan, and the driver.
-- Part 2  Staff (non-driver) records: employees, their tax forms, signed documents, and the functions that fill them.
-- Part 3  Staff documents: a "staff" audience for document templates, and storage rules for the staff folder.
-- Part 4  Hire plans: one function applies them, so new people (not just existing accounts) get their position and pay.

-- ===============================================================================================================
-- Part 1. The office decides W-2 or 1099
-- ===============================================================================================================
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS default_employment_type text
  CHECK (default_employment_type IS NULL OR default_employment_type IN ('w2', '1099', 'lease_purchase'));

ALTER TABLE public.hire_plans
  ADD COLUMN IF NOT EXISTS employment_type text
  CHECK (employment_type IS NULL OR employment_type IN ('w2', '1099', 'lease_purchase'));

-- True once the office has chosen the driver's classification. Until then the driver still picks it themselves
-- (how it worked before), so nobody is wrongly locked into the column default.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS classification_set_by_office boolean NOT NULL DEFAULT false;

-- Built-in positions suggest a classification. The company can change any of them in Settings.
UPDATE public.positions SET default_employment_type = '1099'           WHERE key = 'owner_operator' AND is_builtin AND default_employment_type IS NULL;
UPDATE public.positions SET default_employment_type = 'lease_purchase' WHERE key = 'lease_purchase' AND is_builtin AND default_employment_type IS NULL;
UPDATE public.positions SET default_employment_type = 'w2'
 WHERE key IN ('company_driver', 'dispatcher', 'safety_manager', 'mechanic', 'broker', 'admin') AND is_builtin AND default_employment_type IS NULL;

-- Once the office has set a driver's classification, the driver cannot change it (or the flag) themselves.
CREATE OR REPLACE FUNCTION public.guard_driver_classification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role) THEN RETURN NEW; END IF;
  IF OLD.classification_set_by_office
     AND (NEW.employment_type IS DISTINCT FROM OLD.employment_type
          OR NEW.classification_set_by_office IS DISTINCT FROM OLD.classification_set_by_office) THEN
    RAISE EXCEPTION 'Your classification was set by the office and cannot be changed here' USING ERRCODE = '42501';
  END IF;
  IF NOT OLD.classification_set_by_office AND NEW.classification_set_by_office IS DISTINCT FROM OLD.classification_set_by_office THEN
    RAISE EXCEPTION 'Only the office can confirm a classification' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_driver_classification ON public.drivers;
CREATE TRIGGER trg_guard_driver_classification BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.guard_driver_classification();

-- ===============================================================================================================
-- Part 2. Staff records: employees and their onboarding forms
-- ===============================================================================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                         uuid,
  first_name                      text,
  last_name                       text,
  email                           text,
  phone                           text,
  address                         text,
  employment_type                 text NOT NULL DEFAULT 'w2' CHECK (employment_type IN ('w2')),
  status                          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  hire_date                       date,
  tax_state                       text,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,
  archived_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_uidx ON public.employees (org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_org_idx ON public.employees (org_id);

CREATE OR REPLACE FUNCTION public.get_employee_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.employees WHERE user_id = _user_id AND archived_at IS NULL LIMIT 1 $$;

GRANT SELECT ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_read ON public.employees;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR user_id = auth.uid()));
-- Changes go through the functions below (and the owner's tools), never straight from the browser.
DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- W-4, state tax, I-9 and bank details, one row per employee (same shape as the driver versions).
CREATE TABLE IF NOT EXISTS public.employee_w4_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filing_status text NOT NULL DEFAULT 'single',
  multiple_jobs boolean NOT NULL DEFAULT false,
  dependents_amount numeric NOT NULL DEFAULT 0,
  other_income numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  extra_withholding numeric NOT NULL DEFAULT 0,
  step_2c_checkbox boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_state_tax_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_state text NOT NULL,
  residence_state text NOT NULL,
  filing_status text NOT NULL DEFAULT 'single',
  allowances integer NOT NULL DEFAULT 0,
  additional_withholding numeric NOT NULL DEFAULT 0,
  exempt boolean NOT NULL DEFAULT false,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_i9_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_banking_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name text,
  account_type text,
  routing_number_encrypted bytea,
  account_number_encrypted bytea,
  account_number_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_signed_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid,
  document_type text NOT NULL,
  file_path text NOT NULL,
  admin_file_path text,
  attachment_file_path text,
  address text,
  signature_data_url text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_signed_documents_emp_idx ON public.employee_signed_documents (employee_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_w4_info','employee_state_tax_info','employee_i9_info','employee_banking_info','employee_signed_documents'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Reading: payroll people see everything; the employee sees their own (not their bank details).
DROP POLICY IF EXISTS emp_w4_read ON public.employee_w4_info;
CREATE POLICY emp_w4_read ON public.employee_w4_info FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR employee_id = public.get_employee_id_for_user(auth.uid())));
DROP POLICY IF EXISTS emp_state_tax_read ON public.employee_state_tax_info;
CREATE POLICY emp_state_tax_read ON public.employee_state_tax_info FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR employee_id = public.get_employee_id_for_user(auth.uid())));
DROP POLICY IF EXISTS emp_i9_read ON public.employee_i9_info;
CREATE POLICY emp_i9_read ON public.employee_i9_info FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR employee_id = public.get_employee_id_for_user(auth.uid())));
DROP POLICY IF EXISTS emp_banking_read ON public.employee_banking_info;
CREATE POLICY emp_banking_read ON public.employee_banking_info FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)));
DROP POLICY IF EXISTS emp_signed_docs_read ON public.employee_signed_documents;
CREATE POLICY emp_signed_docs_read ON public.employee_signed_documents FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR employee_id = public.get_employee_id_for_user(auth.uid())));
DROP POLICY IF EXISTS emp_signed_docs_insert ON public.employee_signed_documents;
CREATE POLICY emp_signed_docs_insert ON public.employee_signed_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND employee_id = public.get_employee_id_for_user(auth.uid()));
GRANT INSERT ON public.employee_signed_documents TO authenticated;

-- Who may write for an employee: the employee themself, or the owner / a payroll admin.
CREATE OR REPLACE FUNCTION public.employee_write_org(_employee_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid; _emp_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org := public.get_user_org_id(auth.uid());
  IF _org IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  SELECT org_id INTO _emp_org FROM public.employees WHERE id = _employee_id AND archived_at IS NULL;
  IF _emp_org IS NULL OR _emp_org <> _org THEN RAISE EXCEPTION 'Employee not found in organization'; END IF;
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
          OR _employee_id = public.get_employee_id_for_user(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN _org;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_employee_w4(
  _employee_id uuid, _filing_status text, _multiple_jobs boolean, _dependents_amount numeric,
  _other_income numeric, _deductions numeric, _extra_withholding numeric, _step_2c_checkbox boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _org uuid := public.employee_write_org(_employee_id); _id uuid;
BEGIN
  INSERT INTO public.employee_w4_info AS w (org_id, employee_id, filing_status, multiple_jobs, dependents_amount, other_income, deductions, extra_withholding, step_2c_checkbox)
  VALUES (_org, _employee_id, COALESCE(_filing_status, 'single'), COALESCE(_multiple_jobs, false), COALESCE(_dependents_amount, 0),
          COALESCE(_other_income, 0), COALESCE(_deductions, 0), COALESCE(_extra_withholding, 0), COALESCE(_step_2c_checkbox, false))
  ON CONFLICT (employee_id) DO UPDATE
    SET filing_status = EXCLUDED.filing_status, multiple_jobs = EXCLUDED.multiple_jobs, dependents_amount = EXCLUDED.dependents_amount,
        other_income = EXCLUDED.other_income, deductions = EXCLUDED.deductions, extra_withholding = EXCLUDED.extra_withholding,
        step_2c_checkbox = EXCLUDED.step_2c_checkbox, updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_employee_state_tax(
  _employee_id uuid, _work_state text, _residence_state text, _filing_status text,
  _allowances integer, _additional_withholding numeric, _exempt boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _org uuid := public.employee_write_org(_employee_id); _id uuid; _work text; _res text;
BEGIN
  _work := UPPER(TRIM(COALESCE(_work_state, '')));
  _res  := UPPER(TRIM(COALESCE(_residence_state, '')));
  IF length(_work) <> 2 THEN RAISE EXCEPTION 'Invalid work state'; END IF;
  IF length(_res)  <> 2 THEN RAISE EXCEPTION 'Invalid residence state'; END IF;
  INSERT INTO public.employee_state_tax_info AS s (org_id, employee_id, work_state, residence_state, filing_status, allowances, additional_withholding, exempt, signed_at)
  VALUES (_org, _employee_id, _work, _res, COALESCE(_filing_status, 'single'), COALESCE(_allowances, 0), COALESCE(_additional_withholding, 0), COALESCE(_exempt, false), now())
  ON CONFLICT (employee_id) DO UPDATE
    SET work_state = EXCLUDED.work_state, residence_state = EXCLUDED.residence_state, filing_status = EXCLUDED.filing_status,
        allowances = EXCLUDED.allowances, additional_withholding = EXCLUDED.additional_withholding, exempt = EXCLUDED.exempt,
        signed_at = now(), updated_at = now()
  RETURNING id INTO _id;
  UPDATE public.employees SET tax_state = _work WHERE id = _employee_id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_employee_i9(
  _employee_id uuid, _full_name text, _other_last_names text, _address text, _dob date, _ssn text, _email text,
  _phone text, _citizenship text, _alien_number text, _work_auth_expiry date, _work_auth_doc_number text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _org uuid := public.employee_write_org(_employee_id); _id uuid; _key text; _digits text; _last4 text;
BEGIN
  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;
  _digits := regexp_replace(COALESCE(_ssn, ''), '\D', '', 'g');
  _last4 := CASE WHEN length(_digits) >= 4 THEN right(_digits, 4) ELSE NULL END;
  INSERT INTO public.employee_i9_info AS x (org_id, employee_id, full_name, other_last_names, address, dob, ssn_encrypted, ssn_last4, email, phone, citizenship, alien_number, work_auth_expiry, work_auth_doc_number)
  VALUES (_org, _employee_id, _full_name, NULLIF(_other_last_names, ''), _address, _dob,
          CASE WHEN _digits = '' THEN NULL ELSE pgp_sym_encrypt(_digits, _key) END, _last4, _email, _phone, _citizenship,
          NULLIF(_alien_number, ''), _work_auth_expiry, NULLIF(_work_auth_doc_number, ''))
  ON CONFLICT (employee_id) DO UPDATE
    SET full_name = EXCLUDED.full_name, other_last_names = EXCLUDED.other_last_names, address = EXCLUDED.address, dob = EXCLUDED.dob,
        ssn_encrypted = COALESCE(EXCLUDED.ssn_encrypted, x.ssn_encrypted), ssn_last4 = COALESCE(EXCLUDED.ssn_last4, x.ssn_last4),
        email = EXCLUDED.email, phone = EXCLUDED.phone, citizenship = EXCLUDED.citizenship, alien_number = EXCLUDED.alien_number,
        work_auth_expiry = EXCLUDED.work_auth_expiry, work_auth_doc_number = EXCLUDED.work_auth_doc_number,
        attested_at = now(), updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_employee_banking(
  _employee_id uuid, _bank_name text, _account_type text, _routing_number text, _account_number text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _org uuid := public.employee_write_org(_employee_id); _id uuid; _key text; _last4 text;
BEGIN
  _routing_number := regexp_replace(COALESCE(_routing_number, ''), '\D', '', 'g');
  _account_number := regexp_replace(COALESCE(_account_number, ''), '\D', '', 'g');
  _last4 := CASE WHEN length(_account_number) >= 4 THEN right(_account_number, 4) ELSE NULL END;
  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;
  INSERT INTO public.employee_banking_info AS b (org_id, employee_id, bank_name, account_type, routing_number_encrypted, account_number_encrypted, account_number_last4)
  VALUES (_org, _employee_id, NULLIF(trim(_bank_name), ''), NULLIF(_account_type, ''),
          CASE WHEN _routing_number = '' THEN NULL ELSE pgp_sym_encrypt(_routing_number, _key) END,
          CASE WHEN _account_number = '' THEN NULL ELSE pgp_sym_encrypt(_account_number, _key) END, _last4)
  ON CONFLICT (employee_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name, account_type = EXCLUDED.account_type,
        routing_number_encrypted = COALESCE(EXCLUDED.routing_number_encrypted, b.routing_number_encrypted),
        account_number_encrypted = COALESCE(EXCLUDED.account_number_encrypted, b.account_number_encrypted),
        account_number_last4 = COALESCE(EXCLUDED.account_number_last4, b.account_number_last4), updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- The employee's own contact details, saved from the first onboarding step.
CREATE OR REPLACE FUNCTION public.save_my_employee_profile(
  _phone text, _address text, _emergency_name text, _emergency_phone text, _emergency_relationship text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _emp uuid := public.get_employee_id_for_user(auth.uid());
BEGIN
  IF _emp IS NULL THEN RAISE EXCEPTION 'No staff record for this account'; END IF;
  UPDATE public.employees
     SET phone = NULLIF(trim(_phone), ''), address = NULLIF(trim(_address), ''),
         emergency_contact_name = NULLIF(trim(_emergency_name), ''),
         emergency_contact_phone = NULLIF(trim(_emergency_phone), ''),
         emergency_contact_relationship = NULLIF(trim(_emergency_relationship), '')
   WHERE id = _emp;
  RETURN _emp;
END;
$$;

-- Finishing onboarding: only once the required forms really are on file.
CREATE OR REPLACE FUNCTION public.complete_my_staff_onboarding()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _emp uuid := public.get_employee_id_for_user(auth.uid());
BEGIN
  IF _emp IS NULL THEN RAISE EXCEPTION 'No staff record for this account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employee_w4_info WHERE employee_id = _emp)
     OR NOT EXISTS (SELECT 1 FROM public.employee_i9_info WHERE employee_id = _emp)
     OR NOT EXISTS (SELECT 1 FROM public.employee_state_tax_info WHERE employee_id = _emp) THEN
    RAISE EXCEPTION 'The W-4, I-9 and state tax forms must be on file first';
  END IF;
  UPDATE public.profiles SET onboarding_completed = true, requires_onboarding = false WHERE user_id = auth.uid();
  RETURN true;
END;
$$;

-- Creating the staff record happens when the person is invited (done by the invite functions, never the browser).
CREATE OR REPLACE FUNCTION public.ensure_employee(
  _org uuid, _user uuid, _email text, _first text, _last text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.employees WHERE org_id = _org AND user_id = _user AND archived_at IS NULL LIMIT 1;
  IF _id IS NOT NULL THEN
    UPDATE public.employees SET email = COALESCE(email, lower(_email)), first_name = COALESCE(first_name, _first), last_name = COALESCE(last_name, _last) WHERE id = _id;
    RETURN _id;
  END IF;
  INSERT INTO public.employees (org_id, user_id, email, first_name, last_name, hire_date)
  VALUES (_org, _user, lower(_email), _first, _last, CURRENT_DATE) RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_employee(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_employee(uuid, uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_employee_w4(uuid, text, boolean, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_employee_state_tax(uuid, text, text, text, integer, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_employee_i9(uuid, text, text, text, date, text, text, text, text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_employee_banking(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_employee_profile(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_my_staff_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_employee_w4(uuid, text, boolean, numeric, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_employee_state_tax(uuid, text, text, text, integer, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_employee_i9(uuid, text, text, text, date, text, text, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_employee_banking(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_employee_profile(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_my_staff_onboarding() TO authenticated;

-- ===============================================================================================================
-- Part 3. Staff documents: a "staff" audience on templates, and a private staff folder in storage
-- ===============================================================================================================
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.document_templates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%applies_to%'
  LOOP
    EXECUTE format('ALTER TABLE public.document_templates DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_applies_to_check CHECK (applies_to IN ('shared', 'w2', '1099', 'staff'));

-- Staff files live at {org}/staff/{employee_id}/file. Owner and payroll already read the whole org folder.
DROP POLICY IF EXISTS "Staff can upload their own signed documents" ON storage.objects;
CREATE POLICY "Staff can upload their own signed documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
    AND (storage.foldername(name))[2] = 'staff'
    AND (storage.foldername(name))[3] = public.get_employee_id_for_user(auth.uid())::text
  );
DROP POLICY IF EXISTS "Staff can read their own signed documents" ON storage.objects;
CREATE POLICY "Staff can read their own signed documents" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
    AND (storage.foldername(name))[2] = 'staff'
    AND (storage.foldername(name))[3] = public.get_employee_id_for_user(auth.uid())::text
    AND name NOT LIKE '%.full.pdf'
  );
-- Safety people may read driver paperwork (not banking), but not other staff's tax forms.
DROP POLICY IF EXISTS "Safety can read non-banking signed documents" ON storage.objects;
CREATE POLICY "Safety can read non-banking signed documents" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
    AND (storage.foldername(name))[2] <> 'staff'
    AND has_role(auth.uid(), 'safety'::app_role)
    AND position('direct_deposit' in name) = 0
    AND name NOT LIKE '%.full.pdf'
  );

-- ===============================================================================================================
-- Part 4. Hire plans: one function, used for every kind of invite
-- ===============================================================================================================
-- Before, the plan (position, pay package, area limit) was only applied when an EXISTING account accepted an
-- invitation. Brand-new people never got it, and a driver's package was attached to the login, not the driver.
CREATE OR REPLACE FUNCTION public.apply_hire_plan_for(_org uuid, _email text, _user uuid, _driver uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  plan public.hire_plans;
  _drv uuid := _driver;
  _emp uuid;
  _drv_type text;
BEGIN
  SELECT * INTO plan FROM public.hire_plans
   WHERE org_id = _org AND lower(email) = lower(_email) AND applied_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF plan.id IS NULL THEN RETURN false; END IF;

  IF _drv IS NULL AND _user IS NOT NULL THEN
    SELECT id INTO _drv FROM public.drivers WHERE org_id = _org AND user_id = _user LIMIT 1;
  END IF;
  IF _drv IS NULL THEN
    _emp := (SELECT id FROM public.employees WHERE org_id = _org AND user_id = _user AND archived_at IS NULL LIMIT 1);
  END IF;

  BEGIN
    IF plan.position_id IS NOT NULL THEN
      INSERT INTO public.position_assignments (org_id, position_id, driver_id, user_id, effective_start, note, created_by)
      VALUES (_org, plan.position_id, _drv, _user, plan.effective_start, 'Set from the hire plan', plan.created_by);
    END IF;

    IF plan.pay_package_id IS NOT NULL THEN
      INSERT INTO public.driver_pay_package_assignments (org_id, package_id, driver_id, user_id, effective_start, note, created_by)
      VALUES (_org, plan.pay_package_id, _drv, _user, plan.effective_start, 'Set from the hire plan', plan.created_by);
    END IF;

    -- The office's classification choice, locked in for drivers.
    IF plan.employment_type IS NOT NULL AND _drv IS NOT NULL THEN
      _drv_type := CASE plan.employment_type WHEN 'w2' THEN 'w2_company' WHEN '1099' THEN '1099_contractor' ELSE 'lease_purchase' END;
      UPDATE public.drivers SET employment_type = _drv_type::employment_type_enum, classification_set_by_office = true WHERE id = _drv;
    END IF;

    IF plan.limit_to_areas AND _user IS NOT NULL AND NOT public.is_owner(_user) THEN
      INSERT INTO public.user_area_access (org_id, user_id, areas, position_id, is_active, changed_by)
      VALUES (_org, _user, plan.areas, plan.position_id, true, plan.created_by)
      ON CONFLICT (org_id, user_id) DO UPDATE SET areas = EXCLUDED.areas, position_id = EXCLUDED.position_id, is_active = true;
    END IF;

    UPDATE public.hire_plans SET applied_at = now(), apply_note = NULL WHERE id = plan.id;
    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.hire_plans SET apply_note = left(SQLERRM, 300) WHERE id = plan.id;
    RETURN false;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_hire_plan_for(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hire_plan_for(uuid, text, uuid, uuid) TO service_role;

-- The existing trigger (existing accounts accepting an invitation) now uses the same function.
CREATE OR REPLACE FUNCTION public.apply_hire_plan_on_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted' OR OLD.status IS NOT DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  PERFORM public.apply_hire_plan_for(NEW.org_id, NEW.email, NEW.invited_user_id, NEW.driver_id);
  RETURN NEW;
END;
$$;

-- Anyone who is already signed in and flagged to onboard, but has no staff record yet (for example people invited
-- before this change), gets one the first time they open staff onboarding. Drivers never use this.
CREATE OR REPLACE FUNCTION public.ensure_my_employee()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid; _id uuid; _first text; _last text; _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _id := public.get_employee_id_for_user(auth.uid());
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  _org := public.get_user_org_id(auth.uid());
  IF _org IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  IF public.has_role(auth.uid(), 'driver'::app_role) THEN RAISE EXCEPTION 'Drivers onboard as drivers'; END IF;
  SELECT first_name, last_name, email INTO _first, _last, _email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.employees (org_id, user_id, email, first_name, last_name, hire_date)
  VALUES (_org, auth.uid(), lower(_email), _first, _last, CURRENT_DATE) RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_my_employee() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_employee() TO authenticated;
