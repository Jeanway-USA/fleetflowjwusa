## Problem
Submitting a maintenance/driver request fails with `new row violates row-level security policy for table "driver_requests"`. RLS requires `org_id = get_user_org_id(auth.uid())` on insert, but `DriverRequestForm.tsx` inserts without `org_id`. Same root cause as the recent trucks fix.

## Fix
Add a `BEFORE INSERT` trigger on `public.driver_requests` that auto-fills `org_id` from the authenticated user — mirroring `set_maintenance_request_org_id_trg` and the new `set_trucks_org_id_trg`.

### Migration
- Create `public.set_driver_request_org_id()` security-definer function that sets `NEW.org_id := public.get_user_org_id(auth.uid())` when null.
- Create `BEFORE INSERT` trigger `set_driver_request_org_id_trg` on `public.driver_requests`.

No client or policy changes.
