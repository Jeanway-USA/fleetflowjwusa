CREATE OR REPLACE FUNCTION public.create_onboarding_org(
  _name text,
  _tier text DEFAULT 'solo_bco'
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

  INSERT INTO public.organizations (name, subscription_tier)
  VALUES (_name, _tier)
  RETURNING id INTO _org_id;

  UPDATE public.profiles
  SET org_id = _org_id
  WHERE user_id = _user_id;

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (_user_id, 'owner', _org_id);

  RETURN _org_id;
END;
$$;