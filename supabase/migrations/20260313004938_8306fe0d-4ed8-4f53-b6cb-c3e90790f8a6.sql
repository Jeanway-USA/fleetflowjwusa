-- 1. Dashboard data
DROP VIEW IF EXISTS public.super_admin_dashboard_data;
CREATE VIEW public.super_admin_dashboard_data
WITH (security_invoker = false) AS
SELECT ( SELECT count(*)::integer FROM organizations) AS total_orgs,
       ( SELECT count(*)::integer FROM organizations WHERE created_at >= (now() - '7 days'::interval)) AS signups_7d,
       ( SELECT count(*)::integer FROM organizations WHERE created_at >= (now() - '30 days'::interval)) AS signups_30d,
       ( SELECT COALESCE(jsonb_agg(jsonb_build_object('tier', t.tier, 'count', t.cnt)), '[]'::jsonb)
         FROM ( SELECT subscription_tier AS tier, count(*)::integer AS cnt FROM organizations GROUP BY subscription_tier) t) AS tier_distribution
WHERE is_super_admin();

REVOKE ALL ON public.super_admin_dashboard_data FROM anon, public;
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;

-- 2. Audit logs
DROP VIEW IF EXISTS public.super_admin_audit_logs;
CREATE VIEW public.super_admin_audit_logs
WITH (security_invoker = false) AS
SELECT a.id, a.user_id, a.action, a.table_name, a.record_id, a.details, a.created_at, a.org_id,
       o.name AS org_name
FROM audit_logs a
LEFT JOIN organizations o ON o.id = a.org_id
WHERE is_super_admin()
ORDER BY a.created_at DESC
LIMIT 50;

REVOKE ALL ON public.super_admin_audit_logs FROM anon, public;
GRANT SELECT ON public.super_admin_audit_logs TO authenticated;

-- 3. Usage metrics
DROP VIEW IF EXISTS public.super_admin_usage_metrics;
CREATE VIEW public.super_admin_usage_metrics
WITH (security_invoker = false) AS
SELECT ( SELECT count(*)::integer FROM fleet_loads) AS total_fleet_loads,
       ( SELECT count(*)::integer FROM agency_loads) AS total_agency_loads,
       ( SELECT count(*)::integer FROM trucks) AS total_trucks,
       ( SELECT count(*)::integer FROM trailers) AS total_trailers,
       ( SELECT count(*)::integer FROM drivers) AS total_drivers,
       ( SELECT COALESCE(json_agg(row_to_json(d.*)), '[]'::json)
         FROM ( SELECT date_trunc('day', fleet_loads.created_at)::date AS day, count(*)::integer AS count
                FROM fleet_loads WHERE created_at >= (now() - '30 days'::interval)
                GROUP BY date_trunc('day', fleet_loads.created_at)::date
                ORDER BY date_trunc('day', fleet_loads.created_at)::date) d) AS loads_per_day_30d
WHERE is_super_admin();

REVOKE ALL ON public.super_admin_usage_metrics FROM anon, public;
GRANT SELECT ON public.super_admin_usage_metrics TO authenticated;