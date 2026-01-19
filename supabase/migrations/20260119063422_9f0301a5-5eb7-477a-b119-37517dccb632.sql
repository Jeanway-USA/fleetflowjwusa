-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.driver_notifications;

-- The trigger function runs with SECURITY DEFINER which bypasses RLS,
-- so we don't need a separate INSERT policy for the system.
-- Dispatchers and owners can insert via the existing ALL policy.