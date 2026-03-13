
CREATE OR REPLACE FUNCTION public.super_admin_end_beta()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE organizations
  SET is_active = false, subscription_status = 'expired', updated_at = now()
  WHERE subscription_tier = 'open_beta' AND is_active = true;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_resume_beta()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE organizations
  SET is_active = true, subscription_status = 'active', updated_at = now()
  WHERE subscription_tier = 'open_beta' AND is_active = false;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
