
-- 1. Add deleted_at + archived_by to the 10 new tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'settlements','driver_settlements','driver_payroll','load_expenses',
    'agent_commissions','safety_bonus_payouts',
    'load_status_logs','load_intermediate_stops','load_accessorials','maintenance_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id) WHERE deleted_at IS NULL', t || '_active_idx', t);
  END LOOP;
END $$;

-- 2. Update archive_record allow-list
CREATE OR REPLACE FUNCTION public.archive_record(_table text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid;
  _allowed text[] := ARRAY[
    'drivers','trucks','trailers','fleet_loads','agency_loads',
    'crm_contacts','facilities','parts_inventory','truck_stops',
    'company_resources','document_templates','expenses','fuel_purchases',
    'maintenance_requests','work_orders','incidents','detention_requests',
    'driver_requests',
    'settlements','driver_settlements','driver_payroll','load_expenses',
    'agent_commissions','safety_bonus_payouts',
    'load_status_logs','load_intermediate_stops','load_accessorials','maintenance_logs'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_table = ANY(_allowed)) THEN RAISE EXCEPTION 'Table % not archivable', _table; END IF;
  IF NOT public.has_archive_access(auth.uid(), _table) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(auth.uid());
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), archived_by = $1 WHERE id = $2 AND org_id = $3 AND deleted_at IS NULL',
    _table
  ) USING auth.uid(), _id, _org;
END;
$function$;

-- 3. Update restore_record allow-list
CREATE OR REPLACE FUNCTION public.restore_record(_table text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid;
  _allowed text[] := ARRAY[
    'drivers','trucks','trailers','fleet_loads','agency_loads',
    'crm_contacts','facilities','parts_inventory','truck_stops',
    'company_resources','document_templates','expenses','fuel_purchases',
    'maintenance_requests','work_orders','incidents','detention_requests',
    'driver_requests',
    'settlements','driver_settlements','driver_payroll','load_expenses',
    'agent_commissions','safety_bonus_payouts',
    'load_status_logs','load_intermediate_stops','load_accessorials','maintenance_logs'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_table = ANY(_allowed)) THEN RAISE EXCEPTION 'Table % not archivable', _table; END IF;
  IF NOT public.has_archive_access(auth.uid(), _table) THEN RAISE EXCEPTION 'Access denied'; END IF;
  _org := public.get_user_org_id(auth.uid());
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, archived_by = NULL WHERE id = $1 AND org_id = $2',
    _table
  ) USING _id, _org;
END;
$function$;

-- 4. Update has_archive_access role map
CREATE OR REPLACE FUNCTION public.has_archive_access(_user_id uuid, _table text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_owner(_user_id) THEN RETURN true; END IF;

  RETURN CASE _table
    WHEN 'drivers' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'driver_requests' THEN public.has_role(_user_id, 'payroll_admin'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'trucks' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'trailers' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'parts_inventory' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'maintenance_requests' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'work_orders' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'maintenance_logs' THEN public.has_role(_user_id, 'maintenance'::app_role) OR public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'fleet_loads' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'agency_loads' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'facilities' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'truck_stops' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'detention_requests' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'crm_contacts' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'company_resources' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'document_templates' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'load_status_logs' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'load_intermediate_stops' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'load_accessorials' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'expenses' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'fuel_purchases' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'settlements' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'driver_settlements' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'driver_payroll' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'load_expenses' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'agent_commissions' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'safety_bonus_payouts' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'incidents' THEN public.has_role(_user_id, 'safety'::app_role)
    ELSE false
  END;
END;
$function$;
