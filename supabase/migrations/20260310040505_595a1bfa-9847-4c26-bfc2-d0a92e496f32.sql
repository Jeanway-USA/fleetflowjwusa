-- 1. Fix has_safety_access: replace 'dispatcher' with 'safety'
CREATE OR REPLACE FUNCTION public.has_safety_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'safety')
  )
$$;

-- 2. Fix org_storage_config SELECT policy: restrict to owners only
DROP POLICY IF EXISTS "Org members can view storage config" ON public.org_storage_config;
CREATE POLICY "Owners can view storage config"
  ON public.org_storage_config
  FOR SELECT
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

-- 3. Fix super_admin_usage_metrics view: add is_super_admin() guard
CREATE OR REPLACE VIEW public.super_admin_usage_metrics AS
SELECT
  (SELECT count(*)::integer FROM fleet_loads) AS total_fleet_loads,
  (SELECT count(*)::integer FROM agency_loads) AS total_agency_loads,
  (SELECT count(*)::integer FROM trucks) AS total_trucks,
  (SELECT count(*)::integer FROM trailers) AS total_trailers,
  (SELECT count(*)::integer FROM drivers) AS total_drivers,
  (SELECT COALESCE(json_agg(row_to_json(d.*)), '[]'::json)
   FROM (
     SELECT date_trunc('day', fleet_loads.created_at)::date AS day,
            count(*)::integer AS count
     FROM fleet_loads
     WHERE fleet_loads.created_at >= (now() - '30 days'::interval)
     GROUP BY date_trunc('day', fleet_loads.created_at)::date
     ORDER BY date_trunc('day', fleet_loads.created_at)::date
   ) d) AS loads_per_day_30d
WHERE is_super_admin();

-- 4. Fix drivers_public_view: use security_invoker to inherit RLS from drivers table
DROP VIEW IF EXISTS public.drivers_public_view;
CREATE VIEW public.drivers_public_view WITH (security_invoker = true) AS
SELECT
  id,
  first_name,
  last_name,
  email,
  phone,
  status,
  hire_date,
  has_twic,
  user_id,
  created_at,
  updated_at,
  endorsements,
  avatar_url,
  org_id
FROM drivers;

REVOKE ALL ON public.drivers_public_view FROM anon;
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- 5. Fix notify_load_status_email search_path
CREATE OR REPLACE FUNCTION public.notify_load_status_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    jsonb_build_object('record', row_to_json(NEW)::jsonb),
    '{}'::jsonb,
    ('{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('supabase.service_role_key', true) || '"}')::jsonb
  );
  RETURN NEW;
END;
$$;