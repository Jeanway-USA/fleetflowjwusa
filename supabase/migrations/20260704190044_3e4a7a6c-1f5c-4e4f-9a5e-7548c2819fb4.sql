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
  -- Skip only writes to Super Admin page tables (avoid noise from admin surfaces).
  -- All other tables are logged regardless of actor, including super_admins.
  IF TG_TABLE_NAME = ANY(v_skip_tables) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
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
      INTO v_user_name FROM public.profiles WHERE user_id = v_user_id LIMIT 1;
    SELECT role::text INTO v_user_role
      FROM public.user_roles
      WHERE user_id = v_user_id AND (v_org_id IS NULL OR org_id = v_org_id)
      LIMIT 1;
    IF v_user_role IS NULL AND public.is_super_admin() THEN
      v_user_role := 'super_admin';
    END IF;
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
$function$;