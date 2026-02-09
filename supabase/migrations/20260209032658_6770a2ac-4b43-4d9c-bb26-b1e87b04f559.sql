
-- Fix 1: Restrict base drivers table access - remove dispatcher access to PII
-- Dispatchers should use drivers_public_view (which excludes sensitive fields)
DROP POLICY IF EXISTS "Safety roles can view all drivers" ON public.drivers;

-- Add policy for actual 'safety' role only (not dispatchers)
CREATE POLICY "Safety role can view all drivers"
ON public.drivers
FOR SELECT
USING (has_role(auth.uid(), 'safety'::app_role));

-- Fix 2: Clean up duplicate SELECT policy on incident_witnesses
-- Keep "Safety roles can view all witnesses", drop the duplicate "Safety roles can view witnesses"
DROP POLICY IF EXISTS "Safety roles can view witnesses" ON public.incident_witnesses;
