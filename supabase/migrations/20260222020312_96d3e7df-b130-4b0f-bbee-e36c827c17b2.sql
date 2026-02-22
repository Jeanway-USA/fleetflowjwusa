
DROP VIEW IF EXISTS public.super_admin_organizations;

CREATE VIEW public.super_admin_organizations
WITH (security_invoker = false)
AS
SELECT
  o.id, o.name, o.subscription_tier, o.created_at,
  o.trial_ends_at, o.is_active, o.primary_color, o.logo_url, o.banner_url,
  (SELECT count(*) FROM public.profiles p WHERE p.org_id = o.id)::int AS user_count
FROM public.organizations o
WHERE public.is_super_admin();

GRANT SELECT ON public.super_admin_organizations TO authenticated;
REVOKE ALL ON public.super_admin_organizations FROM anon;

CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE organizations SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    updated_at = now()
  WHERE id = target_org_id;
END; $$;
