
-- 1. Fix drivers_public_view: recreate with security_invoker so it inherits drivers table RLS
DROP VIEW IF EXISTS public.drivers_public_view;
CREATE VIEW public.drivers_public_view
WITH (security_invoker = true)
AS SELECT
  id, first_name, last_name, email, phone, status,
  hire_date, has_twic, user_id, created_at, updated_at,
  endorsements, avatar_url, org_id
FROM public.drivers;

-- Revoke anon access
REVOKE ALL ON public.drivers_public_view FROM anon;
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- 2. Recreate super_admin views with security_invoker = true for defense-in-depth
-- (they already self-gate with WHERE is_super_admin() but views bypass underlying RLS)

DROP VIEW IF EXISTS public.super_admin_audit_logs;
CREATE VIEW public.super_admin_audit_logs
WITH (security_invoker = true)
AS SELECT a.id, a.user_id, a.action, a.table_name, a.record_id, a.details, a.created_at, a.org_id,
          o.name AS org_name
   FROM audit_logs a LEFT JOIN organizations o ON o.id = a.org_id
   WHERE is_super_admin()
   ORDER BY a.created_at DESC LIMIT 50;

REVOKE ALL ON public.super_admin_audit_logs FROM anon;
GRANT SELECT ON public.super_admin_audit_logs TO authenticated;

DROP VIEW IF EXISTS public.super_admin_organizations;
CREATE VIEW public.super_admin_organizations
WITH (security_invoker = true)
AS SELECT id, name, subscription_tier, created_at, trial_ends_at, is_active,
          primary_color, logo_url, banner_url, is_complimentary, complimentary_ends_at,
          (SELECT count(*)::integer FROM profiles p WHERE p.org_id = o.id) AS user_count
   FROM organizations o
   WHERE is_super_admin();

REVOKE ALL ON public.super_admin_organizations FROM anon;
GRANT SELECT ON public.super_admin_organizations TO authenticated;

DROP VIEW IF EXISTS public.super_admin_dashboard_data;
CREATE VIEW public.super_admin_dashboard_data
WITH (security_invoker = true)
AS SELECT
  (SELECT count(*)::integer FROM organizations) AS total_orgs,
  (SELECT count(*)::integer FROM organizations WHERE created_at >= now() - interval '7 days') AS signups_7d,
  (SELECT count(*)::integer FROM organizations WHERE created_at >= now() - interval '30 days') AS signups_30d,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('tier', t.tier, 'count', t.cnt)), '[]'::jsonb)
   FROM (SELECT subscription_tier AS tier, count(*)::integer AS cnt FROM organizations GROUP BY subscription_tier) t) AS tier_distribution
WHERE is_super_admin();

REVOKE ALL ON public.super_admin_dashboard_data FROM anon;
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;

DROP VIEW IF EXISTS public.super_admin_usage_metrics;
CREATE VIEW public.super_admin_usage_metrics
WITH (security_invoker = true)
AS SELECT
  (SELECT count(*)::integer FROM fleet_loads) AS total_fleet_loads,
  (SELECT count(*)::integer FROM agency_loads) AS total_agency_loads,
  (SELECT count(*)::integer FROM trucks) AS total_trucks,
  (SELECT count(*)::integer FROM trailers) AS total_trailers,
  (SELECT count(*)::integer FROM drivers) AS total_drivers,
  (SELECT COALESCE(json_agg(row_to_json(d.*)), '[]'::json)
   FROM (SELECT date_trunc('day', fleet_loads.created_at)::date AS day, count(*)::integer AS count
         FROM fleet_loads WHERE created_at >= now() - interval '30 days'
         GROUP BY 1 ORDER BY 1) d) AS loads_per_day_30d
WHERE is_super_admin();

REVOKE ALL ON public.super_admin_usage_metrics FROM anon;
GRANT SELECT ON public.super_admin_usage_metrics TO authenticated;
