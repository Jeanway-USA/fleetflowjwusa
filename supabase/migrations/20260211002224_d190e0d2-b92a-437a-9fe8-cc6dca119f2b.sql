
-- Remove the operations SELECT policy that exposes encrypted passwords on base table
DROP POLICY IF EXISTS "Operations roles can view all driver settings" ON public.driver_settings;

-- Recreate it with restricted columns - operations should use driver_settings_safe view instead
-- But we keep the policy to allow reading non-password fields for legitimate operations
-- The safe approach: drop and let operations use the safe view
-- Operations can already access driver_settings_safe view (authenticated users)
