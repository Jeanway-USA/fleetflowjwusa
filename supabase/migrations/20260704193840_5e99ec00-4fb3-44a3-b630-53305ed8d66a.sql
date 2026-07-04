
-- 0. Patch log_audit_event: `resource_type` is a generated column now, so drop it from the INSERT.
CREATE OR REPLACE FUNCTION public.log_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_user_role text;
  v_skip_tables text[] := ARRAY[
    'super_admins',
    'changelog',
    'subscription_plans',
    'promo_codes',
    'internal_config',
    'user_feedback',
    'organizations'
  ];
BEGIN
  IF TG_TABLE_NAME = ANY(v_skip_tables) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    v_record_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  BEGIN
    v_org_id := NULLIF(COALESCE(v_new, v_old) ->> 'org_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  IF v_org_id IS NULL AND v_user_id IS NOT NULL THEN
    v_org_id := public.get_user_org_id(v_user_id);
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email)
    INTO v_user_name
    FROM public.profiles
    WHERE user_id = v_user_id
    LIMIT 1;

    SELECT role::text
    INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND (v_org_id IS NULL OR org_id = v_org_id)
    LIMIT 1;

    IF v_user_role IS NULL AND public.is_super_admin() THEN
      v_user_role := 'super_admin';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    org_id,
    action,
    table_name,
    record_id,
    previous_values,
    new_values,
    user_name,
    user_role,
    details
  ) VALUES (
    v_user_id,
    v_org_id,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old,
    v_new,
    v_user_name,
    v_user_role,
    jsonb_build_object('operation', TG_OP, 'timestamp', now())
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1. Extend driver_payroll with W-2 columns
ALTER TABLE public.driver_payroll
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS federal_income_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_security_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medicare_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_medicare_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_ss_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_medicare_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_fica_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fl_suta_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fl_suta_wage_base_applied numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS filing_status text,
  ADD COLUMN IF NOT EXISTS w4_extra_withholding numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w4_dependents_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stub_pdf_path text,
  ADD COLUMN IF NOT EXISTS stub_generated_at timestamptz;

-- 2. payroll_settings
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  fit_brackets jsonb NOT NULL DEFAULT '{
    "single":[{"over":0,"base":0,"rate":0.10},{"over":15000,"base":1500,"rate":0.12},{"over":61000,"base":7020,"rate":0.22},{"over":130150,"base":22222,"rate":0.24},{"over":249350,"base":50830,"rate":0.32},{"over":316375,"base":72278,"rate":0.35},{"over":764600,"base":229158.75,"rate":0.37}],
    "married_joint":[{"over":0,"base":0,"rate":0.10},{"over":30000,"base":3000,"rate":0.12},{"over":122000,"base":14040,"rate":0.22},{"over":260300,"base":44466,"rate":0.24},{"over":498700,"base":101682,"rate":0.32},{"over":632750,"base":144578,"rate":0.35},{"over":943450,"base":253323.50,"rate":0.37}],
    "head_of_household":[{"over":0,"base":0,"rate":0.10},{"over":22500,"base":2250,"rate":0.12},{"over":88750,"base":10200,"rate":0.22},{"over":138500,"base":21145,"rate":0.24},{"over":257700,"base":49753,"rate":0.32},{"over":324725,"base":71201,"rate":0.35},{"over":772950,"base":228080.25,"rate":0.37}]
  }'::jsonb,
  standard_deduction jsonb NOT NULL DEFAULT '{"single":15000,"married_joint":30000,"head_of_household":22500}'::jsonb,
  social_security_rate numeric NOT NULL DEFAULT 0.062,
  social_security_wage_base numeric NOT NULL DEFAULT 176100,
  medicare_rate numeric NOT NULL DEFAULT 0.0145,
  additional_medicare_rate numeric NOT NULL DEFAULT 0.009,
  additional_medicare_threshold numeric NOT NULL DEFAULT 200000,
  suta_rate numeric NOT NULL DEFAULT 0.027,
  suta_wage_base numeric NOT NULL DEFAULT 7000,
  pay_frequency text NOT NULL DEFAULT 'weekly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_settings TO authenticated;
GRANT ALL ON public.payroll_settings TO service_role;

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_settings_read_org"
  ON public.payroll_settings FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "payroll_settings_write_owner_admin"
  ON public.payroll_settings FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE TRIGGER trg_payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_payroll_settings_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- 3. driver_w4_info
CREATE TABLE IF NOT EXISTS public.driver_w4_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_w4_info TO authenticated;
GRANT ALL ON public.driver_w4_info TO service_role;

ALTER TABLE public.driver_w4_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "w4_read_own_or_admin"
  ON public.driver_w4_info FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_payroll_access(auth.uid()) OR driver_id = public.get_driver_id_for_user(auth.uid()))
  );

CREATE POLICY "w4_write_admin"
  ON public.driver_w4_info FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE TRIGGER trg_driver_w4_updated_at
  BEFORE UPDATE ON public.driver_w4_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_driver_w4_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_w4_info
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- 4. Seed payroll_settings for existing orgs
INSERT INTO public.payroll_settings (org_id)
SELECT o.id FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_settings ps WHERE ps.org_id = o.id);

-- 5. Storage RLS on `documents` bucket for pay stubs
-- Path: payroll-stubs/{org_id}/{driver_id}/{payroll_id}.pdf
CREATE POLICY "pay_stubs_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'payroll-stubs'
    AND public.has_payroll_access(auth.uid())
    AND (storage.foldername(name))[2] = public.get_user_org_id(auth.uid())::text
  );

CREATE POLICY "pay_stubs_admin_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'payroll-stubs'
    AND public.has_payroll_access(auth.uid())
    AND (storage.foldername(name))[2] = public.get_user_org_id(auth.uid())::text
  );

CREATE POLICY "pay_stubs_driver_read_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'payroll-stubs'
    AND (storage.foldername(name))[2] = public.get_user_org_id(auth.uid())::text
    AND (storage.foldername(name))[3] = public.get_driver_id_for_user(auth.uid())::text
  );
