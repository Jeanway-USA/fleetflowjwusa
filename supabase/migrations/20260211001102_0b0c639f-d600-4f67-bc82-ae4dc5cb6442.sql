
-- Fix 1: Restrict drivers_public_view to authenticated users only (remove public/anon access)
REVOKE ALL ON public.drivers_public_view FROM anon;
REVOKE ALL ON public.drivers_public_view FROM public;
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- Fix 2: Remove the unrestricted driver_locations policy that bypasses sharing preference
DROP POLICY IF EXISTS "Operations roles can view all driver locations" ON public.driver_locations;

-- Fix 3: Create a safe view for driver_settings that excludes the landstar_password column
CREATE OR REPLACE VIEW public.driver_settings_safe AS
SELECT 
  id,
  driver_id,
  weekly_miles_goal,
  weekly_revenue_goal,
  theme_preference,
  landstar_username,
  created_at,
  updated_at
FROM public.driver_settings;

-- Grant access to the safe view
GRANT SELECT ON public.driver_settings_safe TO authenticated;
REVOKE ALL ON public.driver_settings_safe FROM anon;
REVOKE ALL ON public.driver_settings_safe FROM public;
