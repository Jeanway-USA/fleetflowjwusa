-- Fix audit log read visibility, keep write protection, and remove duplicate fleet_loads audit trigger

-- 1) Remove the duplicate fleet_loads audit trigger. Keep the canonical audit_fleet_loads trigger.
DROP TRIGGER IF EXISTS trg_audit_fleet_loads ON public.fleet_loads;

-- Ensure the canonical trigger exists and is attached to all mutation operations.
DROP TRIGGER IF EXISTS audit_fleet_loads ON public.fleet_loads;
CREATE TRIGGER audit_fleet_loads
AFTER INSERT OR UPDATE OR DELETE ON public.fleet_loads
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_event();

-- 2) Add explicit Data API grants required for the app to read audit rows.
-- RLS still controls which rows are visible.
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- 3) Replace the overly-broad restrictive ALL policy that also blocked SELECT.
DROP POLICY IF EXISTS "No client writes to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;

CREATE POLICY "audit_logs_no_insert"
ON public.audit_logs
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "audit_logs_no_update"
ON public.audit_logs
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "audit_logs_no_delete"
ON public.audit_logs
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);

-- 4) Keep the audit recorder database-owned, org-scoped, and consistent.
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_user_role text;
  v_skip_tables text[] := ARRAY[
    'super_admins',
    'changelog',
    'subscription_plans',
    'promo_codes',
    'internal_config',
    'user_feedback',
    'organizations'
  ];
BEGIN
  -- Skip only writes to Super Admin page/config tables.
  -- Super admin actions on operational tables are still audited.
  IF TG_TABLE_NAME = ANY(v_skip_tables) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

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

  BEGIN
    v_record_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  BEGIN
    v_org_id := NULLIF(COALESCE(v_new, v_old) ->> 'org_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  IF v_org_id IS NULL AND v_user_id IS NOT NULL THEN
    v_org_id := public.get_user_org_id(v_user_id);
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email)
    INTO v_user_name
    FROM public.profiles
    WHERE user_id = v_user_id
    LIMIT 1;

    SELECT role::text
    INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND (v_org_id IS NULL OR org_id = v_org_id)
    LIMIT 1;

    IF v_user_role IS NULL AND public.is_super_admin() THEN
      v_user_role := 'super_admin';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    org_id,
    action,
    table_name,
    resource_type,
    record_id,
    previous_values,
    new_values,
    user_name,
    user_role,
    details
  ) VALUES (
    v_user_id,
    v_org_id,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_record_id,
    v_old,
    v_new,
    v_user_name,
    v_user_role,
    jsonb_build_object('operation', TG_OP, 'timestamp', now())
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;