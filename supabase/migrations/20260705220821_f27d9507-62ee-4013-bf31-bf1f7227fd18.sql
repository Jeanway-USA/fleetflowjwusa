
-- New generic role helper. Extend by adding rows to user_roles with new role values
-- and (if needed) mapping legacy admin-tier roles to the new value here.
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Highest privilege wins
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND role::text IN ('admin','owner','payroll_admin','dispatcher','safety','maintenance')
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND role::text = 'driver'
    ) THEN 'driver'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

-- Collapse legacy admin-tier roles to 'admin' in JeanWay
UPDATE public.user_roles
   SET role = 'admin'
 WHERE role::text IN ('owner','payroll_admin','dispatcher','safety','maintenance');
