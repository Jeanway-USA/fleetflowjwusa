
-- Ensure views are only accessible to authenticated users (belt-and-suspenders)
REVOKE ALL ON public.drivers_public_view FROM anon, public;
GRANT SELECT ON public.drivers_public_view TO authenticated;

REVOKE ALL ON public.super_admin_dashboard_data FROM anon, public;
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;

REVOKE ALL ON public.super_admin_usage_metrics FROM anon, public;
GRANT SELECT ON public.super_admin_usage_metrics TO authenticated;

REVOKE ALL ON public.super_admin_organizations FROM anon, public;
GRANT SELECT ON public.super_admin_organizations TO authenticated;

REVOKE ALL ON public.super_admin_audit_logs FROM anon, public;
GRANT SELECT ON public.super_admin_audit_logs TO authenticated;
