-- Phase 1: Fix company_resources public access
DROP POLICY IF EXISTS "Authenticated users can view company resources" ON public.company_resources;

CREATE POLICY "Operations roles can view company resources" 
  ON public.company_resources 
  FOR SELECT 
  USING (has_operations_access(auth.uid()));

-- Phase 2: Create drivers_public_view for field-level security
-- This view excludes sensitive PII fields for non-payroll users
CREATE OR REPLACE VIEW public.drivers_public_view AS
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

-- Grant access to the view
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- Phase 2: Restrict incident_witnesses to safety role only
DROP POLICY IF EXISTS "Authenticated users can view witnesses" ON public.incident_witnesses;
DROP POLICY IF EXISTS "Admin users can view witnesses" ON public.incident_witnesses;

CREATE POLICY "Safety roles can view witnesses" 
  ON public.incident_witnesses 
  FOR SELECT 
  USING (has_safety_access(auth.uid()));

CREATE POLICY "Safety roles can insert witnesses" 
  ON public.incident_witnesses 
  FOR INSERT 
  WITH CHECK (has_safety_access(auth.uid()));

CREATE POLICY "Safety roles can update witnesses" 
  ON public.incident_witnesses 
  FOR UPDATE 
  USING (has_safety_access(auth.uid()));

CREATE POLICY "Safety roles can delete witnesses" 
  ON public.incident_witnesses 
  FOR DELETE 
  USING (has_safety_access(auth.uid()));

-- Phase 5: Create audit_logs table for compliance
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only owners can view audit logs
CREATE POLICY "Owners can view audit logs" 
  ON public.audit_logs 
  FOR SELECT 
  USING (is_owner(auth.uid()));

-- System can insert audit logs (via service role)
CREATE POLICY "System can insert audit logs" 
  ON public.audit_logs 
  FOR INSERT 
  WITH CHECK (true);

-- Create audit function for sensitive table changes
CREATE OR REPLACE FUNCTION public.audit_sensitive_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now()
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Add audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_driver_payroll_changes ON public.driver_payroll;
CREATE TRIGGER audit_driver_payroll_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_payroll
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();

DROP TRIGGER IF EXISTS audit_settlements_changes ON public.settlements;
CREATE TRIGGER audit_settlements_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();

DROP TRIGGER IF EXISTS audit_drivers_changes ON public.drivers;
CREATE TRIGGER audit_drivers_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();

DROP TRIGGER IF EXISTS audit_incidents_changes ON public.incidents;
CREATE TRIGGER audit_incidents_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();