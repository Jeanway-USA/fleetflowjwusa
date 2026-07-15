
-- 1. Add deleted_at + archived_by columns to all covered tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'drivers','trucks','trailers','fleet_loads','agency_loads',
    'crm_contacts','facilities','parts_inventory','truck_stops',
    'company_resources','document_templates','expenses','fuel_purchases',
    'maintenance_requests','work_orders','incidents','detention_requests',
    'driver_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at) WHERE deleted_at IS NOT NULL',
                   t || '_archived_idx', t);
  END LOOP;
END$$;

-- Active-row indexes on hot tables
CREATE INDEX IF NOT EXISTS fleet_loads_active_idx ON public.fleet_loads (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS drivers_active_idx ON public.drivers (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS trucks_active_idx ON public.trucks (org_id) WHERE deleted_at IS NULL;

-- 2. Permission helper: which roles can archive which tables
CREATE OR REPLACE FUNCTION public.has_archive_access(_user_id uuid, _table text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    WHEN 'fleet_loads' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'agency_loads' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'facilities' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'truck_stops' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'detention_requests' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'crm_contacts' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'company_resources' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'document_templates' THEN public.has_role(_user_id, 'dispatcher'::app_role)
    WHEN 'expenses' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'fuel_purchases' THEN public.has_role(_user_id, 'payroll_admin'::app_role)
    WHEN 'incidents' THEN public.has_role(_user_id, 'safety'::app_role)
    ELSE false
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_archive_access(uuid, text) TO authenticated;

-- 3. Archive RPC
CREATE OR REPLACE FUNCTION public.archive_record(_table text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
  _allowed text[] := ARRAY[
    'drivers','trucks','trailers','fleet_loads','agency_loads',
    'crm_contacts','facilities','parts_inventory','truck_stops',
    'company_resources','document_templates','expenses','fuel_purchases',
    'maintenance_requests','work_orders','incidents','detention_requests',
    'driver_requests'
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
$$;

GRANT EXECUTE ON FUNCTION public.archive_record(text, uuid) TO authenticated;

-- 4. Restore RPC
CREATE OR REPLACE FUNCTION public.restore_record(_table text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
  _allowed text[] := ARRAY[
    'drivers','trucks','trailers','fleet_loads','agency_loads',
    'crm_contacts','facilities','parts_inventory','truck_stops',
    'company_resources','document_templates','expenses','fuel_purchases',
    'maintenance_requests','work_orders','incidents','detention_requests',
    'driver_requests'
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
$$;

GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid) TO authenticated;
