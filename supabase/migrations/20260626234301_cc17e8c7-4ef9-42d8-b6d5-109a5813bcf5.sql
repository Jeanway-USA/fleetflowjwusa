
-- 1. Extend audit_logs with diff/identity columns
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS previous_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

-- resource_type as a generated alias of table_name (skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='audit_logs' AND column_name='resource_type') THEN
    ALTER TABLE public.audit_logs
      ADD COLUMN resource_type text GENERATED ALWAYS AS (table_name) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON public.audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_table_idx       ON public.audit_logs (org_id, table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx        ON public.audit_logs (org_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_record_idx      ON public.audit_logs (record_id);

-- 2. Append-only guardrails
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;

DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update" ON public.audit_logs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs FOR DELETE USING (false);

-- 3. Universal trigger function
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_record_id uuid;
  v_prev jsonb;
  v_new jsonb;
  v_user_name text;
  v_user_role text;
  v_first_name text;
  v_last_name text;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prev := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    v_org := COALESCE((to_jsonb(OLD)->>'org_id')::uuid, NULL);
  ELSIF TG_OP = 'INSERT' THEN
    v_prev := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org := COALESCE((to_jsonb(NEW)->>'org_id')::uuid, NULL);
  ELSE -- UPDATE
    v_prev := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org := COALESCE((to_jsonb(NEW)->>'org_id')::uuid, (to_jsonb(OLD)->>'org_id')::uuid);
    -- Skip no-op updates
    IF v_prev = v_new THEN RETURN NEW; END IF;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT first_name, last_name, email INTO v_first_name, v_last_name, v_email
    FROM public.profiles WHERE user_id = v_uid LIMIT 1;
    v_user_name := NULLIF(btrim(COALESCE(v_first_name,'') || ' ' || COALESCE(v_last_name,'')), '');
    IF v_user_name IS NULL THEN v_user_name := v_email; END IF;

    SELECT role::text INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_uid AND (org_id = v_org OR v_org IS NULL)
    ORDER BY CASE role::text WHEN 'owner' THEN 1 WHEN 'payroll_admin' THEN 2
                              WHEN 'dispatcher' THEN 3 WHEN 'safety' THEN 4
                              WHEN 'maintenance' THEN 5 WHEN 'driver' THEN 6 ELSE 9 END
    LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_name, user_role, action, table_name, record_id,
    previous_values, new_values, details, org_id
  ) VALUES (
    v_uid, v_user_name, v_user_role, TG_OP, TG_TABLE_NAME, v_record_id,
    v_prev, v_new,
    jsonb_build_object('operation', TG_OP, 'timestamp', now()),
    v_org
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- 4. Drop old thin audit triggers that overlap, then attach the new one
DROP TRIGGER IF EXISTS audit_drivers_changes      ON public.drivers;
DROP TRIGGER IF EXISTS audit_settlements_changes  ON public.settlements;

DROP TRIGGER IF EXISTS audit_row_change_fleet_loads        ON public.fleet_loads;
DROP TRIGGER IF EXISTS audit_row_change_driver_settlements ON public.driver_settlements;
DROP TRIGGER IF EXISTS audit_row_change_settlements        ON public.settlements;
DROP TRIGGER IF EXISTS audit_row_change_drivers            ON public.drivers;
DROP TRIGGER IF EXISTS audit_row_change_trucks             ON public.trucks;
DROP TRIGGER IF EXISTS audit_row_change_trailers           ON public.trailers;

CREATE TRIGGER audit_row_change_fleet_loads
  AFTER INSERT OR UPDATE OR DELETE ON public.fleet_loads
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_driver_settlements
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_settlements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_settlements
  AFTER INSERT OR UPDATE OR DELETE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_drivers
  AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trucks
  AFTER INSERT OR UPDATE OR DELETE ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row_change_trailers
  AFTER INSERT OR UPDATE OR DELETE ON public.trailers
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 5. Enable realtime
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
