-- 1) Hide encrypted_credentials column from client SELECT.
REVOKE SELECT (encrypted_credentials) ON public.org_storage_config FROM anon, authenticated;

-- 2) Truck stops: restrict writes to super admins (table is global/shared).
DROP POLICY IF EXISTS "Owners can insert truck stops" ON public.truck_stops;
DROP POLICY IF EXISTS "Owners can update truck stops" ON public.truck_stops;
DROP POLICY IF EXISTS "Owners can delete truck stops" ON public.truck_stops;

CREATE POLICY "Super admins can insert truck stops"
ON public.truck_stops FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update truck stops"
ON public.truck_stops FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete truck stops"
ON public.truck_stops FOR DELETE TO authenticated
USING (public.is_super_admin());

-- 3) Driver locations realtime: add publication-level row filter so only
-- rows with is_sharing = true are broadcast. RLS already filters reads,
-- but Realtime channel events bypass RLS, so we apply a publication filter.
ALTER PUBLICATION supabase_realtime DROP TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations WHERE (is_sharing = true);