-- Paying people (Oct 2026). Run once through Lovable. Safe to run again.
-- 1) The company's bank details for the direct deposit file (bank name, routing number, company ID).
-- 2) A payment record for every person in a pay run: how they are paid, whether it was sent, check numbers.
-- 3) One locked-down function that returns the bank details for the people in ONE run, for the deposit file.
--    Only the owner and payroll can call it, and every call is written to the audit log.
-- Account numbers stay encrypted in their own tables, exactly as they are now. Nothing is deleted.

ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS ach_company_name text,
  ADD COLUMN IF NOT EXISTS ach_company_id text,
  ADD COLUMN IF NOT EXISTS ach_bank_name text,
  ADD COLUMN IF NOT EXISTS ach_bank_routing text,
  ADD COLUMN IF NOT EXISTS ach_next_check_number integer NOT NULL DEFAULT 1001;

CREATE TABLE IF NOT EXISTS public.pay_run_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.pay_run_items(id) ON DELETE RESTRICT,
  payee_key text NOT NULL,
  payee_name text NOT NULL,
  method text NOT NULL CHECK (method IN ('direct_deposit', 'check', 'manual')),
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'returned', 'void')),
  account_last4 text,
  check_number integer,
  batch_ref text,
  sent_at timestamptz,
  sent_by uuid,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id)
);
CREATE INDEX IF NOT EXISTS pay_run_payments_run_idx ON public.pay_run_payments (run_id);

GRANT SELECT, INSERT, UPDATE ON public.pay_run_payments TO authenticated;
GRANT ALL ON public.pay_run_payments TO service_role;
ALTER TABLE public.pay_run_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_run_payments_select ON public.pay_run_payments;
CREATE POLICY pay_run_payments_select ON public.pay_run_payments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_run_payments_insert ON public.pay_run_payments;
CREATE POLICY pay_run_payments_insert ON public.pay_run_payments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS pay_run_payments_update ON public.pay_run_payments;
CREATE POLICY pay_run_payments_update ON public.pay_run_payments FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_pay_run_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_pay_run_payment ON public.pay_run_payments;
CREATE TRIGGER trg_touch_pay_run_payment BEFORE UPDATE ON public.pay_run_payments FOR EACH ROW EXECUTE FUNCTION public.touch_pay_run_payment();

-- Bank details for the people in one pay run, decrypted. Drivers come from driver_banking_info, staff from employee_banking_info
-- (staff are found through the login on their pay statement). Owner and payroll only; each call is audited.
CREATE OR REPLACE FUNCTION public.get_run_bank_details(_run_id uuid)
RETURNS TABLE (item_id uuid, bank_name text, account_type text, routing_number text, account_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _uid uuid := auth.uid(); _org uuid; _key text; _run_org uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_payroll_access(_uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(_uid);
  SELECT org_id INTO _run_org FROM public.pay_runs WHERE id = _run_id;
  IF _run_org IS NULL OR _run_org <> _org THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN RAISE EXCEPTION 'Encryption key missing'; END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (_uid, 'banking_decrypt_run', 'pay_runs', _run_id, jsonb_build_object('run_id', _run_id), _org);

  RETURN QUERY
  SELECT i.id, d.bank_name, d.account_type,
         CASE WHEN d.routing_number_encrypted IS NOT NULL THEN pgp_sym_decrypt(d.routing_number_encrypted, _key) END,
         CASE WHEN d.account_number_encrypted IS NOT NULL THEN pgp_sym_decrypt(d.account_number_encrypted, _key) END
  FROM public.pay_run_items i
  JOIN public.driver_banking_info d ON d.driver_id = NULLIF(substring(i.payee_key from '^driver:(.*)$'), '')::uuid AND d.org_id = _org
  WHERE i.run_id = _run_id AND i.payee_key LIKE 'driver:%'
  UNION ALL
  SELECT i.id, e.bank_name, e.account_type,
         CASE WHEN e.routing_number_encrypted IS NOT NULL THEN pgp_sym_decrypt(e.routing_number_encrypted, _key) END,
         CASE WHEN e.account_number_encrypted IS NOT NULL THEN pgp_sym_decrypt(e.account_number_encrypted, _key) END
  FROM public.pay_run_items i
  JOIN public.employees emp ON emp.user_id = NULLIF(substring(i.payee_key from '^staff:(.*)$'), '')::uuid AND emp.org_id = _org
  JOIN public.employee_banking_info e ON e.employee_id = emp.id AND e.org_id = _org
  WHERE i.run_id = _run_id AND i.payee_key LIKE 'staff:%';
END;
$$;
REVOKE ALL ON FUNCTION public.get_run_bank_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_run_bank_details(uuid) TO authenticated;

-- Which people in a run have bank details on file (no numbers, just the last 4), for the Payments screen.
CREATE OR REPLACE FUNCTION public.get_run_bank_status(_run_id uuid)
RETURNS TABLE (item_id uuid, bank_name text, account_type text, account_last4 text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _org uuid; _run_org uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_payroll_access(_uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(_uid);
  SELECT org_id INTO _run_org FROM public.pay_runs WHERE id = _run_id;
  IF _run_org IS NULL OR _run_org <> _org THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  RETURN QUERY
  SELECT i.id, d.bank_name, d.account_type, d.account_number_last4
  FROM public.pay_run_items i
  JOIN public.driver_banking_info d ON d.driver_id = NULLIF(substring(i.payee_key from '^driver:(.*)$'), '')::uuid AND d.org_id = _org
  WHERE i.run_id = _run_id AND i.payee_key LIKE 'driver:%'
  UNION ALL
  SELECT i.id, e.bank_name, e.account_type, e.account_number_last4
  FROM public.pay_run_items i
  JOIN public.employees emp ON emp.user_id = NULLIF(substring(i.payee_key from '^staff:(.*)$'), '')::uuid AND emp.org_id = _org
  JOIN public.employee_banking_info e ON e.employee_id = emp.id AND e.org_id = _org
  WHERE i.run_id = _run_id AND i.payee_key LIKE 'staff:%';
END;
$$;
REVOKE ALL ON FUNCTION public.get_run_bank_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_run_bank_status(uuid) TO authenticated;