-- Pay runs and staff taxes (Oct 2026). Run once through Lovable. Safe to run again.
-- 1) Staff pay statements can now carry the taxes withheld from them.
-- 2) A pay run groups one payday's driver settlements and staff statements so they are reviewed, approved and paid together.
-- Nothing here deletes anything. Approved and paid runs cannot be changed.

ALTER TABLE public.staff_pay_statements ADD COLUMN IF NOT EXISTS tax_withholding numeric NOT NULL DEFAULT 0;
ALTER TABLE public.staff_pay_statements ADD COLUMN IF NOT EXISTS tax_calculation jsonb;

CREATE TABLE IF NOT EXISTS public.pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL DEFAULT 'regular' CHECK (run_type IN ('regular', 'off_cycle')),
  pay_date date NOT NULL,
  driver_period_start date,
  driver_period_end date,
  staff_period_start date,
  staff_period_end date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'void')),
  note text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One regular run per payday. A voided run frees the date again.
CREATE UNIQUE INDEX IF NOT EXISTS pay_runs_one_regular_per_date
  ON public.pay_runs (org_id, pay_date) WHERE run_type = 'regular' AND status <> 'void';

CREATE TABLE IF NOT EXISTS public.pay_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE RESTRICT,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('settlement', 'staff_statement')),
  source_id uuid NOT NULL,
  payee_key text NOT NULL,
  payee_name text NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  non_taxable numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source, source_id)
);
CREATE INDEX IF NOT EXISTS pay_run_items_run_idx ON public.pay_run_items (run_id);

GRANT SELECT, INSERT, UPDATE ON public.pay_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pay_run_items TO authenticated;
GRANT ALL ON public.pay_runs TO service_role;
GRANT ALL ON public.pay_run_items TO service_role;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_runs_select ON public.pay_runs;
CREATE POLICY pay_runs_select ON public.pay_runs FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_runs_insert ON public.pay_runs;
CREATE POLICY pay_runs_insert ON public.pay_runs FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_runs_update ON public.pay_runs;
CREATE POLICY pay_runs_update ON public.pay_runs FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

DROP POLICY IF EXISTS pay_run_items_select ON public.pay_run_items;
CREATE POLICY pay_run_items_select ON public.pay_run_items FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_run_items_insert ON public.pay_run_items;
CREATE POLICY pay_run_items_insert ON public.pay_run_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_run_items_update ON public.pay_run_items;
CREATE POLICY pay_run_items_update ON public.pay_run_items FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

-- A run only moves forward (draft, approved, paid) or is voided before it is paid. Once approved, its numbers are fixed.
CREATE OR REPLACE FUNCTION public.protect_pay_runs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'A voided pay run cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'paid' AND (NEW.status <> 'paid' OR NEW.totals IS DISTINCT FROM OLD.totals OR NEW.pay_date IS DISTINCT FROM OLD.pay_date) THEN
    RAISE EXCEPTION 'A paid pay run cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'An approved pay run cannot go back to a draft' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'approved' AND (NEW.totals IS DISTINCT FROM OLD.totals OR NEW.pay_date IS DISTINCT FROM OLD.pay_date) THEN
    RAISE EXCEPTION 'An approved pay run cannot be changed' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_pay_runs ON public.pay_runs;
CREATE TRIGGER trg_protect_pay_runs BEFORE UPDATE ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION public.protect_pay_runs();

CREATE OR REPLACE FUNCTION public.protect_pay_run_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.pay_runs WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  IF _status IN ('approved', 'paid', 'void') THEN
    RAISE EXCEPTION 'The lines of an approved, paid or voided pay run cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_pay_run_items ON public.pay_run_items;
CREATE TRIGGER trg_protect_pay_run_items BEFORE INSERT OR UPDATE ON public.pay_run_items FOR EACH ROW EXECUTE FUNCTION public.protect_pay_run_items();
