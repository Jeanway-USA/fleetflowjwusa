CREATE TABLE IF NOT EXISTS public.tax_year_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  tax_year integer NOT NULL,
  fit_tables jsonb NOT NULL DEFAULT '{}'::jsonb,
  fit_tables_multiple_jobs jsonb NOT NULL DEFAULT '{}'::jsonb,
  standard_deduction jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependent_credit_qualifying_child numeric NOT NULL DEFAULT 2000,
  dependent_credit_other numeric NOT NULL DEFAULT 500,
  social_security_rate numeric NOT NULL DEFAULT 0.062,
  social_security_wage_base numeric NOT NULL DEFAULT 176100,
  medicare_rate numeric NOT NULL DEFAULT 0.0145,
  additional_medicare_rate numeric NOT NULL DEFAULT 0.009,
  additional_medicare_threshold numeric NOT NULL DEFAULT 200000,
  futa_rate numeric NOT NULL DEFAULT 0.006,
  futa_wage_base numeric NOT NULL DEFAULT 7000,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, tax_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_year_configs TO authenticated;
GRANT ALL ON public.tax_year_configs TO service_role;

ALTER TABLE public.tax_year_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll staff can view tax year configs"
ON public.tax_year_configs FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid())
  AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)));

CREATE POLICY "Payroll staff can insert tax year configs"
ON public.tax_year_configs FOR INSERT TO authenticated
WITH CHECK (org_id = public.get_user_org_id(auth.uid())
  AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)));

CREATE POLICY "Payroll staff can update unlocked tax year configs"
ON public.tax_year_configs FOR UPDATE TO authenticated
USING (org_id = public.get_user_org_id(auth.uid())
  AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)))
WITH CHECK (org_id = public.get_user_org_id(auth.uid())
  AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role)));

CREATE POLICY "Owners can delete tax year configs"
ON public.tax_year_configs FOR DELETE TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()));

CREATE TRIGGER update_tax_year_configs_updated_at
BEFORE UPDATE ON public.tax_year_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.state_tax_configurations
  ADD COLUMN IF NOT EXISTS tax_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer;

ALTER TABLE public.driver_payroll
  ADD COLUMN IF NOT EXISTS tax_calculation jsonb,
  ADD COLUMN IF NOT EXISTS tax_override_by uuid,
  ADD COLUMN IF NOT EXISTS tax_override_reason text;

ALTER TABLE public.driver_settlements
  ADD COLUMN IF NOT EXISTS tax_calculation jsonb,
  ADD COLUMN IF NOT EXISTS tax_override_by uuid,
  ADD COLUMN IF NOT EXISTS tax_override_reason text;

ALTER TABLE public.internal_payroll_ledger
  ADD COLUMN IF NOT EXISTS tax_calculation jsonb,
  ADD COLUMN IF NOT EXISTS tax_override_by uuid,
  ADD COLUMN IF NOT EXISTS tax_override_reason text;