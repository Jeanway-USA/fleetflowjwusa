## Diagnosis
The dispatcher Approve flow runs two writes:
1. `UPDATE driver_requests SET status='approved' ...` — succeeds
2. `INSERT INTO driver_notifications (...)` — **fails RLS**, throws, mutation rolls into the error toast.

`driver_notifications` has policy `Owner dispatcher can manage notifications` with `WITH CHECK (org_id = get_user_org_id(auth.uid()))`, but the client insert never sets `org_id` and the table has no auto-fill trigger (verified — `pg_trigger` returns 0 rows). So the row is rejected with the generic RLS error → "Failed to process the request".

## Fix
Mirror the existing `set_<table>_org_id_trg` pattern (used for trucks, maintenance_requests, driver_requests) for `driver_notifications`.

### Migration
- Create `public.set_driver_notification_org_id()` SECURITY DEFINER function: if `NEW.org_id IS NULL`, set it to `public.get_user_org_id(auth.uid())`.
- Drop-if-exists then create `BEFORE INSERT` trigger `set_driver_notification_org_id_trg` on `public.driver_notifications`.

No code or RLS policy changes needed.
