CREATE OR REPLACE FUNCTION public.super_admin_delete_org(target_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF target_org_id = 'a0000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'Cannot delete the protected demo organization';
  END IF;

  DELETE FROM public.incident_photos WHERE org_id = target_org_id;
  DELETE FROM public.load_status_logs WHERE org_id = target_org_id;
  DELETE FROM public.load_expenses WHERE org_id = target_org_id;
  DELETE FROM public.crm_contact_loads WHERE org_id = target_org_id;
  DELETE FROM public.crm_activities WHERE org_id = target_org_id;
  DELETE FROM public.crm_contacts WHERE org_id = target_org_id;
  DELETE FROM public.driver_locations WHERE org_id = target_org_id;
  DELETE FROM public.driver_notifications WHERE org_id = target_org_id;
  DELETE FROM public.driver_performance_metrics WHERE org_id = target_org_id;
  DELETE FROM public.driver_requests WHERE org_id = target_org_id;
  DELETE FROM public.driver_settings WHERE org_id = target_org_id;
  DELETE FROM public.driver_payroll WHERE org_id = target_org_id;
  DELETE FROM public.detention_requests WHERE org_id = target_org_id;
  DELETE FROM public.settlements WHERE org_id = target_org_id;
  DELETE FROM public.agent_commissions WHERE org_id = target_org_id;
  DELETE FROM public.fuel_purchases WHERE org_id = target_org_id;
  DELETE FROM public.expenses WHERE org_id = target_org_id;
  DELETE FROM public.fleet_loads WHERE org_id = target_org_id;
  DELETE FROM public.agency_loads WHERE org_id = target_org_id;
  DELETE FROM public.trailer_assignments WHERE org_id = target_org_id;
  DELETE FROM public.trailers WHERE org_id = target_org_id;
  DELETE FROM public.work_orders WHERE org_id = target_org_id;
  DELETE FROM public.service_schedules WHERE org_id = target_org_id;
  DELETE FROM public.maintenance_logs WHERE org_id = target_org_id;
  DELETE FROM public.documents WHERE org_id = target_org_id;
  DELETE FROM public.general_ledger WHERE org_id = target_org_id;
  DELETE FROM public.company_settings WHERE org_id = target_org_id;
  DELETE FROM public.company_resources WHERE org_id = target_org_id;
  DELETE FROM public.org_storage_config WHERE org_id = target_org_id;
  DELETE FROM public.audit_logs WHERE org_id = target_org_id;
  DELETE FROM public.drivers WHERE org_id = target_org_id;
  DELETE FROM public.trucks WHERE org_id = target_org_id;
  DELETE FROM public.facilities WHERE org_id = target_org_id;

  DELETE FROM public.user_roles WHERE org_id = target_org_id;
  DELETE FROM public.user_roles WHERE user_id IN (
    SELECT user_id FROM public.profiles WHERE org_id = target_org_id
  );
  DELETE FROM public.profiles WHERE org_id = target_org_id;

  DELETE FROM public.organizations WHERE id = target_org_id;
END;
$function$;