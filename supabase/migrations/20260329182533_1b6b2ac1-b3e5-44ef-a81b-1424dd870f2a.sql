
-- Add invoice columns to fleet_loads
ALTER TABLE fleet_loads ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN IF NOT EXISTS invoice_url text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN IF NOT EXISTS invoice_number text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN IF NOT EXISTS invoiced_at timestamptz DEFAULT NULL;

-- Update super_admin_organizations view to include tms_mode, dot_number, mc_number
DROP VIEW IF EXISTS public.super_admin_organizations;
CREATE VIEW public.super_admin_organizations WITH (security_invoker = false) AS
SELECT id, name, subscription_tier, created_at, trial_ends_at, is_active,
       primary_color, logo_url, banner_url, is_complimentary, complimentary_ends_at,
       tms_mode, dot_number, mc_number,
       (SELECT count(*)::integer FROM profiles p WHERE p.org_id = o.id) AS user_count
FROM organizations o
WHERE is_super_admin();

-- Grant access
REVOKE ALL ON public.super_admin_organizations FROM anon, public;
GRANT SELECT ON public.super_admin_organizations TO authenticated;

-- Update super_admin_update_org to accept new_tms_mode
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_subscription_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL,
  new_is_complimentary boolean DEFAULT NULL,
  new_complimentary_ends_at timestamptz DEFAULT NULL,
  new_tms_mode text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate tms_mode if provided
  IF new_tms_mode IS NOT NULL AND new_tms_mode NOT IN ('landstar', 'independent') THEN
    RAISE EXCEPTION 'Invalid TMS mode';
  END IF;

  UPDATE organizations SET
    subscription_tier = COALESCE(new_subscription_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = new_trial_ends_at,
    is_complimentary = COALESCE(new_is_complimentary, is_complimentary),
    complimentary_ends_at = new_complimentary_ends_at,
    tms_mode = COALESCE(new_tms_mode, tms_mode),
    updated_at = now()
  WHERE id = target_org_id;

  -- Auto-delete if deactivated and no users remain
  IF new_is_active = false THEN
    DELETE FROM organizations
    WHERE id = target_org_id
      AND id != 'a0000000-0000-0000-0000-000000000001'
      AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE profiles.org_id = target_org_id
      );
  END IF;
END;
$$;
