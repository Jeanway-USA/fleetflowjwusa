
DROP FUNCTION IF EXISTS public.super_admin_update_org(uuid, text, boolean, timestamptz, boolean, timestamptz);

CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_subscription_tier text DEFAULT NULL,
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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE organizations SET
    subscription_tier = COALESCE(new_subscription_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = new_trial_ends_at,
    is_complimentary = COALESCE(new_is_complimentary, is_complimentary),
    complimentary_ends_at = new_complimentary_ends_at,
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
