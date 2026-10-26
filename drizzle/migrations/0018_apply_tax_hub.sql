-- Tax Hub (Oct 2026). Run once through Lovable. Safe to run again.
-- Staff (non-driver) W-2s need the employee's full Social Security number. Drivers already have get_driver_ssn.
-- This is the same function for employees: owners and payroll admins only, every read is written to the audit log.
-- Nothing else in the Tax Hub needs the database to change: federal law and state facts live in the app's code.

CREATE OR REPLACE FUNCTION public.get_employee_ssn(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _org_id uuid;
  _ssn text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  _org_id := get_user_org_id(auth.uid());

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (auth.uid(), 'ssn_decrypt_view', 'employee_i9_info', _employee_id,
          jsonb_build_object('employee_id', _employee_id), _org_id);

  SELECT CASE
           WHEN i9.ssn_encrypted IS NOT NULL
             THEN pgp_sym_decrypt(i9.ssn_encrypted, _key)
           ELSE NULL
          END
    INTO _ssn
    FROM public.employee_i9_info i9
   WHERE i9.employee_id = _employee_id
     AND i9.org_id = _org_id;

  RETURN _ssn;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employee_ssn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_ssn(uuid) TO authenticated;