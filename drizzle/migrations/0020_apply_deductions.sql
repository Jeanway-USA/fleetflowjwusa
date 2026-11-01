-- Payroll deductions (Oct 2026). Run once through Lovable. Safe to run again.
-- A deduction plan is one standing instruction for one person: health insurance, a 401(k) contribution, a garnishment, a loan
-- repayment. The pay run applies the plans that are in force and records what it took, so balances and yearly limits are exact.
-- Nothing is deleted: a plan is ended or archived, and what was taken stays on record.

CREATE TABLE IF NOT EXISTS public.payroll_deduction_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payee_type text NOT NULL CHECK (payee_type IN ('driver', 'employee')),
  payee_id uuid NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  method text NOT NULL DEFAULT 'flat' CHECK (method IN ('flat', 'percent')),
  amount numeric NOT NULL CHECK (amount >= 0),
  employer_amount numeric NOT NULL DEFAULT 0 CHECK (employer_amount >= 0),
  start_date date NOT NULL,
  end_date date,
  total_to_collect numeric CHECK (total_to_collect IS NULL OR total_to_collect >= 0),
  priority integer,
  catch_up text,
  family_coverage boolean NOT NULL DEFAULT false,
  annual_limit_override numeric,
  supporting_family boolean NOT NULL DEFAULT false,
  arrears_over_12_weeks boolean NOT NULL DEFAULT false,
  levy_exempt_per_period numeric,
  case_reference text,
  pay_to text,
  note text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_deduction_plans_payee_idx ON public.payroll_deduction_plans (org_id, payee_type, payee_id);

CREATE TABLE IF NOT EXISTS public.payroll_deduction_applied (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.payroll_deduction_plans(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('settlement', 'staff_statement')),
  source_id uuid NOT NULL,
  kind text NOT NULL,
  amount numeric NOT NULL,
  employer_amount numeric NOT NULL DEFAULT 0,
  pay_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, source, source_id)
);
CREATE INDEX IF NOT EXISTS payroll_deduction_applied_plan_idx ON public.payroll_deduction_applied (plan_id);

-- Settlement lines that came from a plan say which one.
ALTER TABLE public.driver_settlement_items ADD COLUMN IF NOT EXISTS plan_id uuid;

GRANT SELECT, INSERT, UPDATE ON public.payroll_deduction_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_deduction_applied TO authenticated;
GRANT ALL ON public.payroll_deduction_plans TO service_role;
GRANT ALL ON public.payroll_deduction_applied TO service_role;
ALTER TABLE public.payroll_deduction_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deduction_applied ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deduction_plans_select ON public.payroll_deduction_plans;
CREATE POLICY deduction_plans_select ON public.payroll_deduction_plans FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS deduction_plans_insert ON public.payroll_deduction_plans;
CREATE POLICY deduction_plans_insert ON public.payroll_deduction_plans FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS deduction_plans_update ON public.payroll_deduction_plans;
CREATE POLICY deduction_plans_update ON public.payroll_deduction_plans FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

DROP POLICY IF EXISTS deduction_applied_select ON public.payroll_deduction_applied;
CREATE POLICY deduction_applied_select ON public.payroll_deduction_applied FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS deduction_applied_insert ON public.payroll_deduction_applied;
CREATE POLICY deduction_applied_insert ON public.payroll_deduction_applied FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
-- A draft pay can be made again, which rewrites what it took. The app only does this for draft pay.
DROP POLICY IF EXISTS deduction_applied_update ON public.payroll_deduction_applied;
CREATE POLICY deduction_applied_update ON public.payroll_deduction_applied FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_deduction_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_deduction_plan ON public.payroll_deduction_plans;
CREATE TRIGGER trg_touch_deduction_plan BEFORE UPDATE ON public.payroll_deduction_plans FOR EACH ROW EXECUTE FUNCTION public.touch_deduction_plan();