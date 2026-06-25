
-- 1. Flag column on fleet_loads
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS has_statement_discrepancy boolean NOT NULL DEFAULT false;

-- 2. Discrepancies table
CREATE TABLE IF NOT EXISTS public.settlement_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  load_id uuid NULL REFERENCES public.fleet_loads(id) ON DELETE CASCADE,
  settlement_id uuid NULL REFERENCES public.driver_settlements(id) ON DELETE CASCADE,
  trip_number text NULL,
  expected_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric NOT NULL DEFAULT 0,
  delta_amount numeric NOT NULL DEFAULT 0,
  reason_code text NOT NULL,
  detail text NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_discrepancies_org ON public.settlement_discrepancies(org_id);
CREATE INDEX IF NOT EXISTS idx_settlement_discrepancies_load ON public.settlement_discrepancies(load_id);
CREATE INDEX IF NOT EXISTS idx_settlement_discrepancies_settlement ON public.settlement_discrepancies(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_discrepancies_unresolved ON public.settlement_discrepancies(org_id) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_discrepancies TO authenticated;
GRANT ALL ON public.settlement_discrepancies TO service_role;

ALTER TABLE public.settlement_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view discrepancies"
  ON public.settlement_discrepancies FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Payroll/owner can insert discrepancies"
  ON public.settlement_discrepancies FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  );

CREATE POLICY "Payroll/owner can update discrepancies"
  ON public.settlement_discrepancies FOR UPDATE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  )
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Payroll/owner can delete discrepancies"
  ON public.settlement_discrepancies FOR DELETE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  );

CREATE TRIGGER update_settlement_discrepancies_updated_at
  BEFORE UPDATE ON public.settlement_discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
