## What I found

The database is now logging fleet load changes, but there are two problems:

1. **Duplicate audit triggers exist on `fleet_loads`**
   - `audit_fleet_loads`
   - `trg_audit_fleet_loads`

   This causes every fleet load create/edit/delete to be written twice.

2. **The Audit Trail UI likely can’t read the rows**
   - Recent fleet load audit rows exist in the database for your create/edit/delete actions.
   - But `audit_logs` currently has **no table grants** for app users, so the frontend may be blocked from fetching them even though RLS policies exist.

## Implementation plan

1. **Clean up the `fleet_loads` trigger set**
   - Drop the duplicate audit trigger on `fleet_loads`.
   - Keep one canonical trigger attached to `public.fleet_loads` for insert, update, and delete.

2. **Fix Audit Trail read access**
   - Add the missing table grants for `audit_logs` so authenticated users can read audit entries through the app.
   - Keep client writes blocked: users still cannot create, edit, or delete audit rows manually.
   - Keep the existing owner/org-scoped RLS policy so admins only see their organization’s audit trail.

3. **Strengthen the audit function**
   - Ensure `log_audit_event()` sets `resource_type` consistently to the affected table name.
   - Keep logging super-admin actions on normal operational tables like `fleet_loads`.
   - Continue skipping only Super Admin page/config tables to avoid noise.

4. **Verify after migration**
   - Confirm `fleet_loads` has exactly one audit trigger.
   - Confirm recent fleet load changes appear once in `audit_logs`.
   - Confirm the Audit Trail page can fetch rows using the existing frontend query.

## Technical details

The fix will be a single backend migration only. No frontend code is needed unless the Audit Trail page has an additional filter issue after backend read access is restored.