
CREATE OR REPLACE VIEW public.super_admin_audit_logs
WITH (security_invoker = false)
AS
SELECT
  a.id, a.user_id, a.action, a.table_name, a.record_id,
  a.details, a.created_at, a.org_id,
  o.name AS org_name
FROM public.audit_logs a
LEFT JOIN public.organizations o ON o.id = a.org_id
WHERE public.is_super_admin()
ORDER BY a.created_at DESC
LIMIT 50;
