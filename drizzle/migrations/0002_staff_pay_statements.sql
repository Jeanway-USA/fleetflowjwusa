-- Staff pay statements. Run this whole file once. Safe to run again.

-- Staff pay statements: pay for people who are not drivers (dispatcher, mechanic, admin and so on), worked out
-- from their pay package. Driver settlements are untouched; these are a separate table.
--
-- ADDITIVE ONLY. Statements cannot be deleted by the app (no DELETE privilege). They are archived instead, and a
-- statement that is approved or paid is frozen: only its status can move forward (or it can be archived).
-- Each statement keeps the package, version and every line as they were when it was made.
--
-- Who can do what: owners and payroll_admin create and manage statements; a person reads only their own.
-- Tax withholding is not calculated here. The statement shows pay before taxes.

CREATE TABLE IF NOT EXISTS public.staff_pay_statements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  user_id          uuid NOT NULL,
  package_id       uuid REFERENCES public.pay_packages (id) ON DELETE RESTRICT,
  version_id       uuid,
  version_number   integer,
  package_name     text,
  assignment_id    uuid,
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  gross_pay        numeric NOT NULL DEFAULT 0,
  non_taxable      numeric NOT NULL DEFAULT 0,
  deductions       numeric NOT NULL DEFAULT 0,
  net_pay          numeric NOT NULL DEFAULT 0,
  lines            jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot         jsonb,
  week             jsonb,
  note             text,
  approved_at      timestamptz,
  approved_by      uuid,
  paid_at          timestamptz,
  paid_by          uuid,
  archived_at      timestamptz,
  archived_by      uuid,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_pay_statements_one_live_idx
  ON public.staff_pay_statements (org_id, user_id, period_end) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_pay_statements_user_idx ON public.staff_pay_statements (user_id, period_end DESC);

DROP TRIGGER IF EXISTS trg_staff_pay_statements_updated_at ON public.staff_pay_statements;
CREATE TRIGGER trg_staff_pay_statements_updated_at BEFORE UPDATE ON public.staff_pay_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_pay_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_pay_select" ON public.staff_pay_statements;
CREATE POLICY "staff_pay_select" ON public.staff_pay_statements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid())));
DROP POLICY IF EXISTS "staff_pay_insert" ON public.staff_pay_statements;
CREATE POLICY "staff_pay_insert" ON public.staff_pay_statements FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_manage_pay_packages(auth.uid()) AND status = 'draft');

-- An area limit on payroll also hides staff pay from that person's managers' view of others.
DROP POLICY IF EXISTS "area_limit_payroll" ON public.staff_pay_statements;
CREATE POLICY "area_limit_payroll" ON public.staff_pay_statements AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_area(auth.uid(), 'payroll'));

-- Move a statement forward (draft -> approved -> paid), or archive / restore it. Nothing else can change it.
CREATE OR REPLACE FUNCTION public.set_staff_pay_statement_status(_id uuid, _action text)
RETURNS public.staff_pay_statements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.staff_pay_statements;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can change staff pay statements';
  END IF;
  SELECT * INTO _row FROM public.staff_pay_statements WHERE id = _id AND org_id = public.get_user_org_id(auth.uid());
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Statement not found'; END IF;

  IF _action = 'approve' THEN
    IF _row.status <> 'draft' OR _row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Only a draft can be approved'; END IF;
    UPDATE public.staff_pay_statements SET status = 'approved', approved_at = now(), approved_by = auth.uid() WHERE id = _id RETURNING * INTO _row;
  ELSIF _action = 'pay' THEN
    IF _row.status <> 'approved' OR _row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Only an approved statement can be marked paid'; END IF;
    UPDATE public.staff_pay_statements SET status = 'paid', paid_at = now(), paid_by = auth.uid() WHERE id = _id RETURNING * INTO _row;
  ELSIF _action = 'archive' THEN
    IF _row.status = 'paid' THEN RAISE EXCEPTION 'A paid statement cannot be archived'; END IF;
    UPDATE public.staff_pay_statements SET archived_at = now(), archived_by = auth.uid() WHERE id = _id RETURNING * INTO _row;
  ELSIF _action = 'restore' THEN
    UPDATE public.staff_pay_statements SET archived_at = NULL, archived_by = NULL WHERE id = _id RETURNING * INTO _row;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  RETURN _row;
END;
$$;

GRANT SELECT, INSERT ON public.staff_pay_statements TO authenticated;
GRANT ALL ON public.staff_pay_statements TO service_role;
GRANT EXECUTE ON FUNCTION public.set_staff_pay_statement_status(uuid, text) TO authenticated;