CREATE OR REPLACE FUNCTION public.archive_record(_table text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _org uuid; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_archive_access(_uid, _table) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  CASE _table
    WHEN 'drivers' THEN UPDATE public.drivers SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'trucks' THEN UPDATE public.trucks SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'trailers' THEN UPDATE public.trailers SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'fleet_loads' THEN UPDATE public.fleet_loads SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'agency_loads' THEN UPDATE public.agency_loads SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'crm_contacts' THEN UPDATE public.crm_contacts SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'facilities' THEN UPDATE public.facilities SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'parts_inventory' THEN UPDATE public.parts_inventory SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'truck_stops' THEN UPDATE public.truck_stops SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'company_resources' THEN UPDATE public.company_resources SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'document_templates' THEN UPDATE public.document_templates SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'expenses' THEN UPDATE public.expenses SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'fuel_purchases' THEN UPDATE public.fuel_purchases SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'maintenance_requests' THEN UPDATE public.maintenance_requests SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'work_orders' THEN UPDATE public.work_orders SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'incidents' THEN UPDATE public.incidents SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'detention_requests' THEN UPDATE public.detention_requests SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'driver_requests' THEN UPDATE public.driver_requests SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'settlements' THEN UPDATE public.settlements SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'driver_settlements' THEN UPDATE public.driver_settlements SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'driver_payroll' THEN UPDATE public.driver_payroll SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'load_expenses' THEN UPDATE public.load_expenses SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'agent_commissions' THEN UPDATE public.agent_commissions SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'safety_bonus_payouts' THEN UPDATE public.safety_bonus_payouts SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'load_status_logs' THEN UPDATE public.load_status_logs SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'load_intermediate_stops' THEN UPDATE public.load_intermediate_stops SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'load_accessorials' THEN UPDATE public.load_accessorials SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    WHEN 'maintenance_logs' THEN UPDATE public.maintenance_logs SET deleted_at = now(), archived_by = _uid WHERE id = _id AND org_id = _org AND deleted_at IS NULL;
    ELSE RAISE EXCEPTION 'Table not archivable';
  END CASE;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.restore_record(_table text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _org uuid; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_archive_access(_uid, _table) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(_uid);
  IF _org IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  CASE _table
    WHEN 'drivers' THEN UPDATE public.drivers SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'trucks' THEN UPDATE public.trucks SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'trailers' THEN UPDATE public.trailers SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'fleet_loads' THEN UPDATE public.fleet_loads SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'agency_loads' THEN UPDATE public.agency_loads SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'crm_contacts' THEN UPDATE public.crm_contacts SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'facilities' THEN UPDATE public.facilities SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'parts_inventory' THEN UPDATE public.parts_inventory SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'truck_stops' THEN UPDATE public.truck_stops SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'company_resources' THEN UPDATE public.company_resources SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'document_templates' THEN UPDATE public.document_templates SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'expenses' THEN UPDATE public.expenses SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'fuel_purchases' THEN UPDATE public.fuel_purchases SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'maintenance_requests' THEN UPDATE public.maintenance_requests SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'work_orders' THEN UPDATE public.work_orders SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'incidents' THEN UPDATE public.incidents SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'detention_requests' THEN UPDATE public.detention_requests SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'driver_requests' THEN UPDATE public.driver_requests SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'settlements' THEN UPDATE public.settlements SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'driver_settlements' THEN UPDATE public.driver_settlements SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'driver_payroll' THEN UPDATE public.driver_payroll SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'load_expenses' THEN UPDATE public.load_expenses SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'agent_commissions' THEN UPDATE public.agent_commissions SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'safety_bonus_payouts' THEN UPDATE public.safety_bonus_payouts SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'load_status_logs' THEN UPDATE public.load_status_logs SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'load_intermediate_stops' THEN UPDATE public.load_intermediate_stops SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'load_accessorials' THEN UPDATE public.load_accessorials SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    WHEN 'maintenance_logs' THEN UPDATE public.maintenance_logs SET deleted_at = NULL, archived_by = NULL WHERE id = _id AND org_id = _org;
    ELSE RAISE EXCEPTION 'Table not archivable';
  END CASE;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.archive_record(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_record(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_record(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_pay_package(_driver_id uuid, _user_id uuid, _package_id uuid, _start date, _note text DEFAULT NULL::text)
 RETURNS driver_pay_package_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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