
-- ============================================================
-- FIX 1: Driver locations - Respect is_sharing privacy flag
-- Operations should only see locations where driver opted in
-- ============================================================
DROP POLICY IF EXISTS "Operations can view all driver locations" ON public.driver_locations;
CREATE POLICY "Operations can view sharing driver locations" 
  ON public.driver_locations 
  FOR SELECT
  USING (has_operations_access(auth.uid()) AND is_sharing = true);

-- ============================================================
-- FIX 2: Incident witnesses - Remove driver access to contact info
-- Drivers don't need witness phone/email; safety roles have full access
-- ============================================================
DROP POLICY IF EXISTS "Drivers can view witnesses for their incidents" ON public.incident_witnesses;

-- ============================================================
-- FIX 3: Drivers table - Protect sensitive PII fields
-- Recreate view WITHOUT security_invoker so operations can use it
-- even when base table access is restricted.
-- View includes operational fields but excludes: license_number,
-- license_expiry, medical_card_expiry, pay_rate, pay_type,
-- twic_expiry, hazmat_expiry
-- ============================================================
DROP VIEW IF EXISTS public.drivers_public_view;
CREATE VIEW public.drivers_public_view AS
  SELECT id, first_name, last_name, email, phone, status, hire_date,
         has_twic, user_id, created_at, updated_at, endorsements, avatar_url
  FROM public.drivers;

-- Remove overly broad operations SELECT on base drivers table
DROP POLICY IF EXISTS "Operations roles can view drivers basic info" ON public.drivers;

-- Add safety SELECT policy so safety roles retain full access for compliance
CREATE POLICY "Safety roles can view all drivers"
  ON public.drivers
  FOR SELECT
  USING (has_safety_access(auth.uid()));
