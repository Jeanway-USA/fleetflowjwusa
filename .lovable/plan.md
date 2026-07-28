## Problem

Generating safety bonus payouts fails with `column reference "status" is ambiguous`.

The database function `generate_safety_bonus_payouts(date)` declares `RETURNS TABLE(driver_id uuid, safe_miles integer, earned_amount numeric, status text)`. Those output names become variables inside the function body, so unqualified column references in its internal queries collide with them:

- `WHERE ... status = 'delivered'` and `status IN ('late','service_failure')` on `fleet_loads`
- `WHERE driver_id = v_driver.id` on `fleet_loads` / `incidents` (same latent conflict with the `driver_id` output)
- the `ON CONFLICT ... DO UPDATE SET status = ...` clause

Postgres can't tell whether `status` means the table column or the output variable, so it aborts.

## Fix

One migration that replaces the function with a corrected version. No frontend changes needed.

1. Rename the output columns to non-colliding names internally by declaring them as `out_driver_id`, `out_safe_miles`, `out_earned_amount`, `out_status`, keeping the same column order and types so the client-side result shape is unchanged (callers read by position/alias — if any code reads `status`, keep the returned column names identical by instead aliasing in a wrapping `RETURN QUERY`; the simpler, safer route below is preferred).

   Preferred approach: keep the exact same `RETURNS TABLE(driver_id, safe_miles, earned_amount, status)` signature, but fully table-qualify every column reference inside the body:
   - `fleet_loads.status`, `fleet_loads.driver_id`, `fleet_loads.delivery_date`
   - `incidents.driver_id`, `incidents.incident_type`, `incidents.severity`, `incidents.citation_issued`, `incidents.incident_date`
   - `drivers.status`, `drivers.org_id`
   - the `ON CONFLICT DO UPDATE SET` target list (left-hand `status =` is unambiguous, but the `CASE` reads already use the qualified `public.safety_bonus_payouts.status` and stay as-is)

   This preserves the returned column names so no UI code changes.

2. Verify by calling the function for the current month and confirming rows come back and are persisted in `safety_bonus_payouts`.

## Technical notes

- The function stays `SECURITY DEFINER` with `search_path = public` and the existing owner/payroll_admin authorization check.
- Business logic (marginal tier math, eligibility disqualifiers, max bonus cap, paid/approved status preservation on conflict) is unchanged — this is purely a name-resolution fix.
