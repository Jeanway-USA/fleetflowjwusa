DROP POLICY IF EXISTS "Drivers can view their assigned loads" ON public.fleet_loads;
CREATE POLICY "Drivers can view their assigned loads"
ON public.fleet_loads FOR SELECT TO authenticated
USING (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS "Drivers can update status on their assigned loads" ON public.fleet_loads;
CREATE POLICY "Drivers can update status on their assigned loads"
ON public.fleet_loads FOR UPDATE TO authenticated
USING (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
  AND deleted_at IS NULL
);