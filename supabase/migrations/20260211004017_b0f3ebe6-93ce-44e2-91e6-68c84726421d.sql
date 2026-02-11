
-- Revoke public/anon access to drivers_public_view
-- Only authenticated users should access this view
REVOKE ALL ON public.drivers_public_view FROM anon;
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- Revoke public/anon access to driver_settings_safe  
-- Only authenticated users should access this view
REVOKE ALL ON public.driver_settings_safe FROM anon;
GRANT SELECT ON public.driver_settings_safe TO authenticated;
