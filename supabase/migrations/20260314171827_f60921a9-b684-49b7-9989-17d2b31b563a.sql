
CREATE OR REPLACE FUNCTION public.auto_cleanup_empty_orgs()
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

  DELETE FROM organizations
  WHERE is_active = false
    AND id != 'a0000000-0000-0000-0000-000000000001'
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE profiles.org_id = organizations.id
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
