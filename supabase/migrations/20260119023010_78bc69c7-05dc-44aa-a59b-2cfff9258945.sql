-- Allow drivers to update the status of their assigned loads
CREATE POLICY "Drivers can update status on their assigned loads"
ON public.fleet_loads
FOR UPDATE
USING (driver_id = get_driver_id_for_user(auth.uid()))
WITH CHECK (driver_id = get_driver_id_for_user(auth.uid()));