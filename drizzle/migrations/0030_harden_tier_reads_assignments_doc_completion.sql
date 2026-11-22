-- Paid-plan gating on reads
DROP POLICY IF EXISTS tier_gate_agency_loads_select ON public.agency_loads;
CREATE POLICY tier_gate_agency_loads_select ON public.agency_loads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_org_has_feature('agency_loads'::text));
DROP POLICY IF EXISTS tier_gate_agent_commissions_select ON public.agent_commissions;
CREATE POLICY tier_gate_agent_commissions_select ON public.agent_commissions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_org_has_feature('commissions'::text));

-- Documents can only be completed by the signing workflow
CREATE OR REPLACE FUNCTION public.guard_document_instance_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _total int; _signed int;
BEGIN
  IF NEW.signatory_roles IS DISTINCT FROM OLD.signatory_roles
     AND EXISTS (SELECT 1 FROM public.document_signatures WHERE instance_id = OLD.id) THEN
    RAISE EXCEPTION 'Signers cannot be changed after signing has started';
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF pg_trigger_depth() < 2 AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Documents are completed automatically when the last signature is collected';
    END IF;
    _total := GREATEST(COALESCE(array_length(OLD.signatory_roles, 1), 0), COALESCE(array_length(NEW.signatory_roles, 1), 0));
    SELECT count(DISTINCT step_index) INTO _signed FROM public.document_signatures WHERE instance_id = NEW.id;
    IF _signed < _total THEN
      RAISE EXCEPTION 'Document cannot be completed until all required signatures are collected';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Positions: the person must belong to the caller's company
CREATE OR REPLACE FUNCTION public.assign_position(_position_id uuid, _driver_id uuid, _user_id uuid, _start date, _note text)
RETURNS position_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  org uuid := public.get_user_org_id(auth.uid());
  result public.position_assignments;
BEGIN
  IF NOT public.can_manage_pay_packages(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners and payroll admins can assign positions';
  END IF;
  IF org IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _driver_id IS NULL AND _user_id IS NULL THEN RAISE EXCEPTION 'Choose a person'; END IF;
  IF _driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = org) THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF _user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND org_id = org) THEN
    RAISE EXCEPTION 'Person not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.positions WHERE id = _position_id AND org_id = org AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'That position is not available';
  END IF;

  UPDATE public.position_assignments
     SET effective_end = GREATEST(effective_start, _start - 1)
   WHERE org_id = org
     AND effective_end IS NULL
     AND ((_driver_id IS NOT NULL AND driver_id = _driver_id) OR (_user_id IS NOT NULL AND user_id = _user_id));

  INSERT INTO public.position_assignments (org_id, position_id, driver_id, user_id, effective_start, note, created_by)
  VALUES (org, _position_id, _driver_id, _user_id, COALESCE(_start, CURRENT_DATE), _note, auth.uid())
  RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- Pay packages: payroll admins cannot assign one to themselves (owners still can)
CREATE OR REPLACE FUNCTION public.assign_pay_package(_driver_id uuid, _user_id uuid, _package_id uuid, _start date, _note text DEFAULT NULL::text)
RETURNS driver_pay_package_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _row public.driver_pay_package_assignments%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_pay_packages(_uid) THEN RAISE EXCEPTION 'Only owners and payroll admins can assign pay packages'; END IF;
  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _driver_id IS NULL AND _user_id IS NULL THEN RAISE EXCEPTION 'Choose a person'; END IF;
  IF _driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND org_id = _org) THEN RAISE EXCEPTION 'Driver not found'; END IF;
  IF _user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND org_id = _org) THEN RAISE EXCEPTION 'Person not found'; END IF;
  IF NOT public.is_owner(_uid) AND (
       _user_id = _uid
       OR (_driver_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND user_id = _uid))
     ) THEN
    RAISE EXCEPTION 'You cannot assign a pay package to yourself. Ask the owner.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pay_packages WHERE id = _package_id AND org_id = _org) THEN RAISE EXCEPTION 'Package not found'; END IF;

  UPDATE public.driver_pay_package_assignments
  SET effective_end = _start - 1
  WHERE org_id = _org
    AND ((_driver_id IS NOT NULL AND driver_id = _driver_id) OR (_user_id IS NOT NULL AND user_id = _user_id))
    AND effective_start < _start
    AND (effective_end IS NULL OR effective_end >= _start);

  INSERT INTO public.driver_pay_package_assignments (org_id, package_id, driver_id, user_id, effective_start, note, created_by)
  VALUES (_org, _package_id, _driver_id, _user_id, _start, _note, _uid)
  RETURNING * INTO _row;
  RETURN _row;
END;
$function$;