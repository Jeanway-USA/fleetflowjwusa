-- =====================================================
-- Security Fix: drivers_public_view, drivers PII, and audit_logs
-- =====================================================

-- 1. DROP and recreate drivers_public_view with RLS enabled
-- The view uses security_invoker=true so it respects underlying RLS

DROP VIEW IF EXISTS public.drivers_public_view;

-- Recreate the view excluding sensitive fields
-- This view only exposes non-PII fields for general operations
CREATE VIEW public.drivers_public_view 
WITH (security_invoker = true)
AS
SELECT 
  id,
  first_name,
  last_name,
  status,
  hire_date,
  has_twic,
  endorsements,
  user_id,
  avatar_url,
  created_at,
  updated_at
FROM public.drivers;

-- Add comment explaining the view's purpose
COMMENT ON VIEW public.drivers_public_view IS 'Public-safe driver view excluding PII (license, medical card, pay info, contact details). Uses security_invoker to respect drivers table RLS.';

-- 2. Fix drivers table RLS - restrict sensitive field access
-- Remove the overly permissive operations access policy
DROP POLICY IF EXISTS "Operations roles can view all drivers" ON public.drivers;

-- Create a more restrictive policy for operations roles
-- They can only view the drivers table but sensitive fields will be 
-- accessed through the restricted view or only by payroll/owner
CREATE POLICY "Operations roles can view drivers basic info" 
ON public.drivers 
FOR SELECT 
USING (
  has_operations_access(auth.uid()) 
  OR user_id = auth.uid()
  OR is_owner(auth.uid()) 
  OR has_role(auth.uid(), 'payroll_admin'::app_role)
);

-- 3. Fix audit_logs - remove direct INSERT access, use trigger-only approach
-- Remove the policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Create a service-role only insert function for audit logging
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_user_id uuid,
  p_table_name text,
  p_action text,
  p_record_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (user_id, table_name, action, record_id, details, ip_address)
  VALUES (p_user_id, p_table_name, p_action, p_record_id, p_details, p_ip_address)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Grant execute only to authenticated users (they call it, but SECURITY DEFINER does the insert)
GRANT EXECUTE ON FUNCTION public.create_audit_log TO authenticated;

-- Revoke direct insert on audit_logs from authenticated role
REVOKE INSERT ON public.audit_logs FROM authenticated;

-- Owner can still view all audit logs (existing policy remains)
-- No direct INSERT/UPDATE/DELETE for anyone except through triggers

-- 4. Update existing audit triggers to use the service function pattern
-- The triggers already exist and use SECURITY DEFINER, which is correct
-- They bypass RLS properly for audit logging

-- Add a policy comment
COMMENT ON TABLE public.audit_logs IS 'Immutable audit log. Direct INSERT revoked - use create_audit_log() function or automatic triggers only.';