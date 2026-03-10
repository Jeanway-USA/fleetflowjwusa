CREATE OR REPLACE FUNCTION public.super_admin_get_owner_email(target_org_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN (SELECT p.email FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE p.org_id = target_org_id AND ur.role = 'owner' LIMIT 1);
END;
$$;