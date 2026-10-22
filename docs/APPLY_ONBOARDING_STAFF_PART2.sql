-- Staff onboarding, part 2: contractor staff, required documents enforced, and a re-onboard that deletes nothing.
-- Run AFTER docs/APPLY_ONBOARDING_ALL_STAFF.sql (run that one first if it has not been run). Safe to run twice.
-- Additive: nothing here deletes data. It replaces three functions from part 1 with improved versions.
--
-- 1  Staff can be W-2 or 1099 (a contractor who is not a driver): a W-9 table and function for them.
-- 2  Finishing staff onboarding now checks the right forms for W-2 or 1099, and that every active staff document is signed.
-- 3  Hire plans apply the W-2 / 1099 choice to staff too.
-- 4  Re-onboarding a driver (or staff member) asks them to redo it without deleting anything they signed.

-- ===============================================================================================================
-- 1. Contractor staff
-- ===============================================================================================================
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.employees'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%employment_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.employees DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_employment_type_check CHECK (employment_type IN ('w2', '1099'));

CREATE TABLE IF NOT EXISTS public.employee_w9_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employee_w9_info TO authenticated;
GRANT ALL ON public.employee_w9_info TO service_role;
ALTER TABLE public.employee_w9_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emp_w9_read ON public.employee_w9_info;
CREATE POLICY emp_w9_read ON public.employee_w9_info FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR employee_id = public.get_employee_id_for_user(auth.uid())));

CREATE OR REPLACE FUNCTION public.upsert_employee_w9(
  _employee_id uuid, _legal_name text, _business_name text, _tax_class text, _address text,
  _tin_type text, _tin text, _certify_accurate boolean, _certify_backup_withholding boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _org uuid := public.employee_write_org(_employee_id); _id uuid; _key text; _digits text; _last4 text;
BEGIN
  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;
  _digits := regexp_replace(COALESCE(_tin, ''), '\D', '', 'g');
  _last4 := CASE WHEN length(_digits) >= 4 THEN right(_digits, 4) ELSE NULL END;
  INSERT INTO public.employee_w9_info AS x (org_id, employee_id, legal_name, business_name, tax_class, address, tin_type, tin_encrypted, tin_last4, certify_accurate, certify_backup_withholding)
  VALUES (_org, _employee_id, _legal_name, NULLIF(_business_name, ''), _tax_class, _address, _tin_type,
          CASE WHEN _digits = '' THEN NULL ELSE pgp_sym_encrypt(_digits, _key) END, _last4,
          COALESCE(_certify_accurate, false), COALESCE(_certify_backup_withholding, false))
  ON CONFLICT (employee_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name, business_name = EXCLUDED.business_name, tax_class = EXCLUDED.tax_class, address = EXCLUDED.address,
        tin_type = EXCLUDED.tin_type, tin_encrypted = COALESCE(EXCLUDED.tin_encrypted, x.tin_encrypted), tin_last4 = COALESCE(EXCLUDED.tin_last4, x.tin_last4),
        certify_accurate = EXCLUDED.certify_accurate, certify_backup_withholding = EXCLUDED.certify_backup_withholding, signed_at = now(), updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_employee_w9(uuid, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_employee_w9(uuid, text, text, text, text, text, text, boolean, boolean) TO authenticated;

-- The employee's classification, for the onboarding page.
CREATE OR REPLACE FUNCTION public.my_employee_type()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT employment_type FROM public.employees WHERE user_id = auth.uid() AND archived_at IS NULL LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.my_employee_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_employee_type() TO authenticated;

-- ===============================================================================================================
-- 2. Finishing staff onboarding: the right forms, and every active staff document signed
-- ===============================================================================================================
CREATE OR REPLACE FUNCTION public.complete_my_staff_onboarding()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _emp uuid; _org uuid; _type text;
BEGIN
  SELECT id, org_id, employment_type INTO _emp, _org, _type
    FROM public.employees WHERE user_id = auth.uid() AND archived_at IS NULL LIMIT 1;
  IF _emp IS NULL THEN RAISE EXCEPTION 'No staff record for this account'; END IF;

  IF _type = '1099' THEN
    IF NOT EXISTS (SELECT 1 FROM public.employee_w9_info WHERE employee_id = _emp)
       OR NOT EXISTS (SELECT 1 FROM public.employee_state_tax_info WHERE employee_id = _emp) THEN
      RAISE EXCEPTION 'The W-9 and state tax forms must be on file first';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.employee_w4_info WHERE employee_id = _emp)
       OR NOT EXISTS (SELECT 1 FROM public.employee_i9_info WHERE employee_id = _emp)
       OR NOT EXISTS (SELECT 1 FROM public.employee_state_tax_info WHERE employee_id = _emp) THEN
      RAISE EXCEPTION 'The W-4, I-9 and state tax forms must be on file first';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_templates t
    WHERE t.org_id = _org AND t.is_active AND t.applies_to = 'staff'
      AND NOT EXISTS (SELECT 1 FROM public.employee_signed_documents d WHERE d.employee_id = _emp AND d.document_type = t.document_type)
  ) THEN
    RAISE EXCEPTION 'Every staff document the company requires must be signed first';
  END IF;

  UPDATE public.profiles SET onboarding_completed = true, requires_onboarding = false WHERE user_id = auth.uid();
  RETURN true;
END;
$$;

-- ===============================================================================================================
-- 3. Hire plans apply the W-2 / 1099 choice to staff too
-- ===============================================================================================================
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

    IF plan.employment_type IS NOT NULL THEN
      IF _drv IS NOT NULL THEN
        _drv_type := CASE plan.employment_type WHEN 'w2' THEN 'w2_company' WHEN '1099' THEN '1099_contractor' ELSE 'lease_purchase' END;
        UPDATE public.drivers SET employment_type = _drv_type::employment_type_enum, classification_set_by_office = true WHERE id = _drv;
      ELSIF _emp IS NOT NULL THEN
        UPDATE public.employees SET employment_type = CASE plan.employment_type WHEN 'w2' THEN 'w2' ELSE '1099' END WHERE id = _emp;
      END IF;
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

-- ===============================================================================================================
-- 4. Re-onboarding without deleting anything
-- ===============================================================================================================
-- The old driver "reset" tried to delete every signed document. This asks the driver to redo onboarding instead:
-- their signed documents and credentials go back to "revision requested" (the review flow that already exists),
-- they are sent through onboarding again, and everything they signed before stays on file.
CREATE OR REPLACE FUNCTION public.reset_driver_onboarding(_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid; _user uuid; _note text := 'The office asked you to complete onboarding again.';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT org_id, user_id INTO _org, _user FROM public.drivers WHERE id = _driver_id;
  IF _org IS NULL OR _org <> public.get_user_org_id(auth.uid()) THEN RAISE EXCEPTION 'Driver not found in organization'; END IF;
  IF _user IS NULL THEN RAISE EXCEPTION 'Driver has no linked account yet'; END IF;

  UPDATE public.profiles SET onboarding_completed = false, requires_onboarding = true WHERE user_id = _user;
  UPDATE public.driver_signed_documents
     SET review_status = 'revision_requested', revision_notes = _note, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE driver_id = _driver_id AND org_id = _org;
  UPDATE public.drivers
     SET credentials_review_status = 'revision_requested', credentials_revision_notes = _note,
         credentials_reviewed_by = auth.uid(), credentials_reviewed_at = now()
   WHERE id = _driver_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_driver_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_driver_onboarding(uuid) TO authenticated;

-- Same idea for staff: send them back through staff onboarding. What they signed before stays on file.
CREATE OR REPLACE FUNCTION public.reset_staff_onboarding(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE user_id = _user_id AND org_id = public.get_user_org_id(auth.uid()) AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Staff member not found in organization';
  END IF;
  UPDATE public.profiles SET onboarding_completed = false, requires_onboarding = true WHERE user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_staff_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_staff_onboarding(uuid) TO authenticated;
