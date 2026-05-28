-- Expand trucks.status allowed values
ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_status_check;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'in_shop'::text, 'out_of_service'::text, 'pending_inspection'::text, 'down'::text]));

-- Allow maintenance role to create maintenance_requests (e.g. when maintenance starts a thread by messaging a driver)
CREATE POLICY "Maintenance role can insert maintenance requests"
ON public.maintenance_requests
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
);