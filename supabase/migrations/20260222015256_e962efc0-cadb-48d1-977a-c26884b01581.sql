
-- Super Admin function: checks if current user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') IN ('andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com'),
    false
  )
$$;

-- Dashboard aggregate view
CREATE OR REPLACE VIEW public.super_admin_dashboard_data
WITH (security_invoker = false)
AS
SELECT
  (SELECT count(*) FROM public.organizations)::int AS total_orgs,
  (SELECT count(*) FROM public.organizations WHERE created_at >= now() - interval '7 days')::int AS signups_7d,
  (SELECT count(*) FROM public.organizations WHERE created_at >= now() - interval '30 days')::int AS signups_30d,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('tier', t.tier, 'count', t.cnt)), '[]'::jsonb)
   FROM (
     SELECT subscription_tier AS tier, count(*)::int AS cnt
     FROM public.organizations
     GROUP BY subscription_tier
   ) t
  ) AS tier_distribution
WHERE public.is_super_admin();

-- Organizations list view
CREATE OR REPLACE VIEW public.super_admin_organizations
WITH (security_invoker = false)
AS
SELECT
  o.id,
  o.name,
  o.subscription_tier,
  o.created_at,
  (SELECT count(*) FROM public.profiles p WHERE p.org_id = o.id)::int AS user_count
FROM public.organizations o
WHERE public.is_super_admin();

-- Audit logs view (50 most recent across all orgs)
CREATE OR REPLACE VIEW public.super_admin_audit_logs
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.user_id,
  a.action,
  a.table_name,
  a.record_id,
  a.details,
  a.created_at,
  a.org_id
FROM public.audit_logs a
WHERE public.is_super_admin()
ORDER BY a.created_at DESC
LIMIT 50;

-- Grant access to authenticated, revoke from anon
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;
GRANT SELECT ON public.super_admin_organizations TO authenticated;
GRANT SELECT ON public.super_admin_audit_logs TO authenticated;

REVOKE ALL ON public.super_admin_dashboard_data FROM anon;
REVOKE ALL ON public.super_admin_organizations FROM anon;
REVOKE ALL ON public.super_admin_audit_logs FROM anon;
