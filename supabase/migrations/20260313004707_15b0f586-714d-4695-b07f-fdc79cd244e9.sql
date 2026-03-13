DROP VIEW IF EXISTS public.super_admin_organizations;
CREATE VIEW public.super_admin_organizations
WITH (security_invoker = false)
AS SELECT id, name, subscription_tier, created_at, trial_ends_at, is_active,
          primary_color, logo_url, banner_url, is_complimentary, complimentary_ends_at,
          (SELECT count(*)::integer FROM profiles p WHERE p.org_id = o.id) AS user_count
   FROM organizations o
   WHERE is_super_admin();

REVOKE ALL ON public.super_admin_organizations FROM anon, public;
GRANT SELECT ON public.super_admin_organizations TO authenticated;