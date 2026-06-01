-- Unified per-driver payroll settlements (separate from the Landstar `settlements` import table)
CREATE TABLE public.driver_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_pay numeric NOT NULL DEFAULT 0,
  bonus_pay numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric GENERATED ALWAYS AS (base_pay + bonus_pay - deductions) STORED,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_settlements_org_driver_period
  ON public.driver_settlements (org_id, driver_id, period_end DESC);
CREATE INDEX idx_driver_settlements_org_status
  ON public.driver_settlements (org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_settlements TO authenticated;
GRANT ALL ON public.driver_settlements TO service_role;

ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own settlements"
  ON public.driver_settlements FOR SELECT
  USING (driver_id = get_driver_id_for_user(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can view all driver settlements"
  ON public.driver_settlements FOR SELECT
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can manage driver settlements"
  ON public.driver_settlements FOR ALL
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_driver_settlements_updated_at
  BEFORE UPDATE ON public.driver_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Line items linked to a driver settlement
CREATE TABLE public.driver_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  settlement_id uuid NOT NULL REFERENCES public.driver_settlements(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('load_pay','bonus','deduction','advance','reimbursement','adjustment','other')),
  load_id uuid,
  expense_id uuid,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  quantity numeric,
  rate numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_settlement_items_settlement
  ON public.driver_settlement_items (settlement_id);
CREATE INDEX idx_driver_settlement_items_org_load
  ON public.driver_settlement_items (org_id, load_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_settlement_items TO authenticated;
GRANT ALL ON public.driver_settlement_items TO service_role;

ALTER TABLE public.driver_settlement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own settlement items"
  ON public.driver_settlement_items FOR SELECT
  USING (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.driver_settlements s
      WHERE s.id = settlement_id
        AND s.driver_id = get_driver_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Owner payroll can view all driver settlement items"
  ON public.driver_settlement_items FOR SELECT
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Owner payroll can manage driver settlement items"
  ON public.driver_settlement_items FOR ALL
  USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

COMMENT ON TABLE public.driver_payroll IS 'Deprecated — superseded by public.driver_settlements. Do not write new rows.';