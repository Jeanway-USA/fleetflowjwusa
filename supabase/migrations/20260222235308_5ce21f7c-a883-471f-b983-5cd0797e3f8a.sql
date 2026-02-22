
-- Add complimentary columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN is_complimentary boolean NOT NULL DEFAULT false,
  ADD COLUMN complimentary_ends_at timestamptz DEFAULT NULL;

-- Drop and recreate the view with new columns
DROP VIEW IF EXISTS public.super_admin_organizations;

CREATE VIEW public.super_admin_organizations AS
SELECT
  o.id,
  o.name,
  o.subscription_tier,
  o.created_at,
  o.trial_ends_at,
  o.is_active,
  o.primary_color,
  o.logo_url,
  o.banner_url,
  o.is_complimentary,
  o.complimentary_ends_at,
  (SELECT count(*) FROM profiles p WHERE p.org_id = o.id)::integer AS user_count
FROM organizations o
WHERE is_super_admin();

-- Update the super_admin_update_org RPC
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL,
  new_is_complimentary boolean DEFAULT NULL,
  new_complimentary_ends_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE organizations SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = COALESCE(new_trial_ends_at, trial_ends_at),
    is_complimentary = COALESCE(new_is_complimentary, is_complimentary),
    complimentary_ends_at = new_complimentary_ends_at,
    updated_at = now()
  WHERE id = target_org_id;
END;
$$;
