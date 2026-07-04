
-- 1. Generic audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_user_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
  END IF;

  -- record_id
  BEGIN
    v_record_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  -- org_id
  BEGIN
    v_org_id := NULLIF(COALESCE(v_new, v_old) ->> 'org_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;
  IF v_org_id IS NULL AND v_user_id IS NOT NULL THEN
    v_org_id := public.get_user_org_id(v_user_id);
  END IF;

  -- user name/role (best-effort)
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email)
      INTO v_user_name FROM public.profiles WHERE user_id = v_user_id LIMIT 1;
    SELECT role::text INTO v_user_role
      FROM public.user_roles
      WHERE user_id = v_user_id AND (v_org_id IS NULL OR org_id = v_org_id)
      LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, org_id, action, table_name, record_id,
    previous_values, new_values, user_name, user_role, details
  ) VALUES (
    v_user_id, v_org_id, TG_OP, TG_TABLE_NAME, v_record_id,
    v_old, v_new, v_user_name, v_user_role,
    jsonb_build_object('operation', TG_OP, 'timestamp', now())
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 2. Drop legacy per-table audit triggers so we don't double-log
DROP TRIGGER IF EXISTS audit_driver_payroll_changes ON public.driver_payroll;
DROP TRIGGER IF EXISTS audit_row_change_driver_settlements ON public.driver_settlements;
DROP TRIGGER IF EXISTS audit_row_change_drivers ON public.drivers;
DROP TRIGGER IF EXISTS audit_row_change_fleet_loads ON public.fleet_loads;
DROP TRIGGER IF EXISTS audit_incidents_changes ON public.incidents;
DROP TRIGGER IF EXISTS audit_row_change_settlements ON public.settlements;
DROP TRIGGER IF EXISTS audit_row_change_trailers ON public.trailers;
DROP TRIGGER IF EXISTS audit_row_change_trucks ON public.trucks;

-- 3. Attach generic trigger to core tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fleet_loads','agency_loads',
    'profiles','user_roles',
    'trucks','trailers','drivers',
    'crm_contacts','company_resources',
    'driver_signed_documents','documents',
    'driver_settlements','driver_settlement_items','driver_payroll',
    'expenses','truck_loan_payments',
    'work_orders','maintenance_requests',
    'incidents'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t
      );
    END IF;
  END LOOP;
END $$;
