## Problem

Deleting an org fails with:
`update or delete on table "organizations" violates foreign key constraint "audit_logs_org_id_fkey" on table "audit_logs"`

`super_admin_delete_org` already deletes `audit_logs` for the org, but the new DB-level audit triggers fire **during** the cascade of `DELETE`s inside the function (drivers, trucks, loads, etc.), inserting **fresh** `audit_logs` rows *after* line 45's purge. By the time we reach `DELETE FROM organizations`, those new audit rows still reference the org → FK violation.

## Fix

Migration that does two things:

1. **Recreate the FK with `ON DELETE CASCADE`**
   ```sql
   ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_org_id_fkey;
   ALTER TABLE public.audit_logs
     ADD CONSTRAINT audit_logs_org_id_fkey
     FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
   ```
   Audit history for a deleted org gets cleaned up with the org — appropriate, since the org itself is gone.

2. **Harden `super_admin_delete_org`** so it doesn't generate noisy audit rows during the purge and remains resilient:
   - Wrap the purge body in `PERFORM set_config('session_replication_role', 'replica', true);` at the start and reset to `'origin'` at the end. This suppresses the audit triggers for the duration of the SECURITY DEFINER call.
   - Keep the existing `DELETE FROM public.audit_logs WHERE org_id = target_org_id;` as belt-and-suspenders (still runs before org delete).

No frontend changes required. Existing `OrgActionsDropdown` delete flow will just work.

## Files

- new migration: `supabase/migrations/<timestamp>_fix_org_delete_audit_fk.sql`