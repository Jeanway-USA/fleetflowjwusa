
CREATE TABLE IF NOT EXISTS public.driver_state_tax_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_state_tax_info TO authenticated;
GRANT ALL ON public.driver_state_tax_info TO service_role;

ALTER TABLE public.driver_state_tax_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "state_tax_read_own_or_admin"
  ON public.driver_state_tax_info FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_payroll_access(auth.uid()) OR driver_id = public.get_driver_id_for_user(auth.uid()))
  );

CREATE POLICY "state_tax_write_admin"
  ON public.driver_state_tax_info FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE TRIGGER trg_driver_state_tax_updated_at
  BEFORE UPDATE ON public.driver_state_tax_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_driver_state_tax_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_state_tax_info
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Upsert RPC (drivers may set their own; payroll admins/owners may set anyone in org)
CREATE OR REPLACE FUNCTION public.upsert_driver_state_tax(
  _driver_id uuid,
  _work_state text,
  _residence_state text,
  _filing_status text,
  _allowances integer,
  _additional_withholding numeric,
  _exempt boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _org_id uuid;
  _is_admin boolean;
  _is_self boolean;
  _id uuid;
  _work text;
  _res text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _org_id := get_user_org_id(auth.uid());
  IF _org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  _is_admin := is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role);
  _is_self := (_driver_id = get_driver_id_for_user(auth.uid()));
  IF NOT (_is_admin OR _is_self) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Driver not found in organization';
  END IF;

  _work := UPPER(TRIM(COALESCE(_work_state, '')));
  _res  := UPPER(TRIM(COALESCE(_residence_state, '')));
  IF length(_work) <> 2 THEN RAISE EXCEPTION 'Invalid work state'; END IF;
  IF length(_res)  <> 2 THEN RAISE EXCEPTION 'Invalid residence state'; END IF;

  INSERT INTO public.driver_state_tax_info AS s (
    org_id, driver_id, work_state, residence_state, filing_status,
    allowances, additional_withholding, exempt, signed_at
  ) VALUES (
    _org_id, _driver_id, _work, _res, COALESCE(_filing_status, 'single'),
    COALESCE(_allowances, 0), COALESCE(_additional_withholding, 0),
    COALESCE(_exempt, false), now()
  )
  ON CONFLICT (driver_id) DO UPDATE
    SET work_state = EXCLUDED.work_state,
        residence_state = EXCLUDED.residence_state,
        filing_status = EXCLUDED.filing_status,
        allowances = EXCLUDED.allowances,
        additional_withholding = EXCLUDED.additional_withholding,
        exempt = EXCLUDED.exempt,
        signed_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  -- Mirror work_state onto drivers.tax_state so the State Filing Registry
  -- picks it up without an extra join.
  UPDATE public.drivers
     SET tax_state = _work
   WHERE id = _driver_id AND org_id = _org_id;

  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_driver_state_tax(uuid,text,text,text,integer,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_driver_state_tax(uuid,text,text,text,integer,numeric,boolean) TO authenticated;
