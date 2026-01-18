-- Allow drivers to view only the truck assigned to them
-- (required for Driver Dashboard to detect assigned truck)

CREATE POLICY "Drivers can view their assigned truck"
ON public.trucks
FOR SELECT
USING (current_driver_id = get_driver_id_for_user(auth.uid()));