-- Let dispatchers see which driver is on each load (and the driver status and credential dates the dispatch board shows).
-- Run in the Supabase SQL editor (or through Lovable). Safe to run twice. Changes one view; deletes nothing.
--
-- The problem: the "drivers_public_view" view reads the drivers table as the person looking at it, and the drivers
-- table (rightly) hides pay rates, license numbers and so on from dispatchers. So for a dispatcher the view came back
-- empty, and every load looked like it had no driver.
-- The fix: the view reads the table itself, but only hands each person the SAFE columns, and only for their own
-- company and only if their role needs them (owner, dispatcher, payroll, safety, or the driver themself).
-- Pay rates, license numbers, SSN and bank details are NOT in this view and stay hidden from dispatchers.

CREATE OR REPLACE VIEW public.drivers_public_view
WITH (security_invoker = false)
AS
SELECT
  d.id,
  d.first_name,
  d.last_name,
  d.email,
  d.phone,
  d.status,
  d.hire_date,
  d.has_twic,
  d.user_id,
  d.created_at,
  d.updated_at,
  d.endorsements,
  d.avatar_url,
  d.org_id,
  -- what the dispatch board and its alerts need
  d.license_expiry,
  d.medical_card_expiry,
  d.hazmat_expiry,
  d.remaining_drive_hours,
  d.hos_last_updated,
  d.deleted_at
FROM public.drivers d
WHERE d.org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_operations_access(auth.uid())
    OR public.has_payroll_access(auth.uid())
    OR public.has_safety_access(auth.uid())
    OR d.user_id = auth.uid()
  );

REVOKE ALL ON public.drivers_public_view FROM anon, public;
GRANT SELECT ON public.drivers_public_view TO authenticated;

-- Check (as any signed-in person this returns that person's company's drivers, or nothing if their role has no need):
-- SELECT id, first_name, last_name, status FROM public.drivers_public_view;
