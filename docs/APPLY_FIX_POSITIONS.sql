-- Fix for 'new row violates row-level security policy for table positions'. Run once. Safe to run again.

-- Fix: creating a position (and the standard positions on first open) failed with
-- "new row violates row-level security policy for table positions".
--
-- Cause: the read policy called a function that looks the row up in the same table. While a row is being inserted
-- (with an upsert or a returned row), that lookup cannot see it yet, so the read check failed and the insert was
-- refused. The fix reads the row's own columns directly for managers, and only uses a helper (which looks at other
-- tables) for people who merely hold the position or package. Nothing else changes: the same people can read the
-- same rows as before. Safe to run twice.

CREATE OR REPLACE FUNCTION public.holds_position(_position_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.position_assignments a
    LEFT JOIN public.drivers d ON d.id = a.driver_id
    WHERE a.position_id = _position_id AND (a.user_id = auth.uid() OR d.user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.holds_pay_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_pay_package_assignments a
    LEFT JOIN public.drivers d ON d.id = a.driver_id
    WHERE a.package_id = _package_id AND (a.user_id = auth.uid() OR d.user_id = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select" ON public.positions FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.can_manage_pay_packages(auth.uid()) OR public.holds_position(id))
  );

DROP POLICY IF EXISTS "pay_packages_select" ON public.pay_packages;
CREATE POLICY "pay_packages_select" ON public.pay_packages FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.can_manage_pay_packages(auth.uid()) OR public.holds_pay_package(id))
  );

GRANT EXECUTE ON FUNCTION public.holds_position(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.holds_pay_package(uuid) TO authenticated;
