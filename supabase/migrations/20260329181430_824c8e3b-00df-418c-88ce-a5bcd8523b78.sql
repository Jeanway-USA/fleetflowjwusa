
-- Add tms_mode column to organizations
ALTER TABLE public.organizations ADD COLUMN tms_mode text NOT NULL DEFAULT 'landstar';

-- Update create_onboarding_org to accept _tms_mode parameter
CREATE OR REPLACE FUNCTION public.create_onboarding_org(
  _name text,
  _tier text DEFAULT 'open_beta',
  _tms_mode text DEFAULT 'landstar'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate tier to prevent privilege escalation
  IF _tier NOT IN ('open_beta', 'solo_bco') THEN
    RAISE EXCEPTION 'Invalid subscription tier';
  END IF;

  -- Validate tms_mode
  IF _tms_mode NOT IN ('landstar', 'independent') THEN
    RAISE EXCEPTION 'Invalid TMS mode';
  END IF;

  INSERT INTO public.organizations (name, subscription_tier, subscription_status, tms_mode)
  VALUES (_name, _tier, 'active', _tms_mode)
  RETURNING id INTO _org_id;

  UPDATE public.profiles
  SET org_id = _org_id
  WHERE user_id = _user_id;

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (_user_id, 'owner', _org_id)
  ON CONFLICT (user_id, role) DO UPDATE SET org_id = _org_id;

  RETURN _org_id;
END;
$$;
