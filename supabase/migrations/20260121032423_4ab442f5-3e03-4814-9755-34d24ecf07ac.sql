-- Fix Security Definer View issue - recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS public.drivers_public_view;

CREATE VIEW public.drivers_public_view 
WITH (security_invoker = true)
AS
SELECT 
  id,
  first_name,
  last_name,
  email,
  phone,
  status,
  avatar_url,
  hire_date,
  endorsements,
  has_twic,
  created_at,
  updated_at,
  user_id
FROM public.drivers;

-- Re-grant access
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- Fix overly permissive audit_logs INSERT policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Only authenticated users can insert their own audit logs
CREATE POLICY "Authenticated users can insert audit logs" 
  ON public.audit_logs 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);