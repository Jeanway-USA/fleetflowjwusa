
-- 1. FSC on fleet_loads
ALTER TABLE public.fleet_loads ADD COLUMN IF NOT EXISTS fsc_amount NUMERIC NOT NULL DEFAULT 0;

-- 2. Seed payroll tax config into company_settings for each org (idempotent)
INSERT INTO public.company_settings (org_id, setting_key, setting_value, description)
SELECT o.id, v.k, v.val, v.descr
FROM public.organizations o
CROSS JOIN (VALUES
  ('ss_wage_base', '184500', 'Social Security taxable wage base (annual)'),
  ('ss_rate', '0.062', 'Social Security tax rate (EE and ER each)'),
  ('medicare_rate', '0.0145', 'Medicare tax rate (EE and ER each)'),
  ('tx_sui_rate', '0.027', 'Texas SUI (TWC) rate for W-2 employees')
) AS v(k, val, descr)
ON CONFLICT DO NOTHING;

-- 3. internal_payroll_ledger
CREATE TABLE IF NOT EXISTS public.internal_payroll_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_model text NOT NULL,
  employment_type text NOT NULL DEFAULT 'w2',
  total_miles numeric NOT NULL DEFAULT 0,
  gross_line_haul numeric NOT NULL DEFAULT 0,
  pass_through_fsc numeric NOT NULL DEFAULT 0,
  gross_taxable_pay numeric NOT NULL DEFAULT 0,
  federal_withholding_override numeric,
  status text NOT NULL DEFAULT 'draft',
  finalized_at timestamptz,
  finalized_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, driver_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_payroll_ledger TO authenticated;
GRANT ALL ON public.internal_payroll_ledger TO service_role;
ALTER TABLE public.internal_payroll_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_admins_select_ledger" ON public.internal_payroll_ledger
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_insert_ledger" ON public.internal_payroll_ledger
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_update_ledger" ON public.internal_payroll_ledger
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_delete_ledger" ON public.internal_payroll_ledger
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE TRIGGER update_internal_payroll_ledger_updated_at
  BEFORE UPDATE ON public.internal_payroll_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lock finalized rows
CREATE OR REPLACE FUNCTION public.protect_finalized_payroll_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.gross_line_haul IS DISTINCT FROM OLD.gross_line_haul
       OR NEW.pass_through_fsc IS DISTINCT FROM OLD.pass_through_fsc
       OR NEW.gross_taxable_pay IS DISTINCT FROM OLD.gross_taxable_pay
       OR NEW.total_miles IS DISTINCT FROM OLD.total_miles
       OR NEW.federal_withholding_override IS DISTINCT FROM OLD.federal_withholding_override
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
       OR NEW.pay_model IS DISTINCT FROM OLD.pay_model
    THEN
      RAISE EXCEPTION 'Finalized payroll ledger rows are locked for audit integrity'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Finalized payroll ledger rows cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER protect_finalized_payroll_ledger_upd
  BEFORE UPDATE ON public.internal_payroll_ledger
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_payroll_ledger();
CREATE TRIGGER protect_finalized_payroll_ledger_del
  BEFORE DELETE ON public.internal_payroll_ledger
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_payroll_ledger();

-- 4. tax_withholding_ledger
CREATE TABLE IF NOT EXISTS public.tax_withholding_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  ledger_id uuid NOT NULL REFERENCES public.internal_payroll_ledger(id) ON DELETE CASCADE,
  ee_social_security numeric NOT NULL DEFAULT 0,
  er_social_security numeric NOT NULL DEFAULT 0,
  ee_medicare numeric NOT NULL DEFAULT 0,
  employer_medicare numeric NOT NULL DEFAULT 0,
  federal_income_withholding numeric NOT NULL DEFAULT 0,
  tx_twc_unemployment numeric NOT NULL DEFAULT 0,
  fl_reemployment numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ledger_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_withholding_ledger TO authenticated;
GRANT ALL ON public.tax_withholding_ledger TO service_role;
ALTER TABLE public.tax_withholding_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_admins_select_tax" ON public.tax_withholding_ledger
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_insert_tax" ON public.tax_withholding_ledger
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_update_tax" ON public.tax_withholding_ledger
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_delete_tax" ON public.tax_withholding_ledger
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE TRIGGER update_tax_withholding_ledger_updated_at
  BEFORE UPDATE ON public.tax_withholding_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. truist_payout_logs
CREATE TABLE IF NOT EXISTS public.truist_payout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  ledger_id uuid NOT NULL REFERENCES public.internal_payroll_ledger(id) ON DELETE CASCADE,
  truist_ach_ref_code text NOT NULL,
  net_payout_amount numeric NOT NULL DEFAULT 0,
  marked_paid_at timestamptz NOT NULL DEFAULT now(),
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.truist_payout_logs TO authenticated;
GRANT ALL ON public.truist_payout_logs TO service_role;
ALTER TABLE public.truist_payout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_admins_select_payout" ON public.truist_payout_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "payroll_admins_insert_payout" ON public.truist_payout_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
CREATE POLICY "super_admin_update_payout" ON public.truist_payout_logs
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_delete_payout" ON public.truist_payout_logs
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
