## Root cause

`public.log_audit_event()` already exists in the database, but **no triggers are attached to any tables**. That's why the Audit Trail feed is empty — nothing writes to `audit_logs`. Also, the function currently logs actions from super admins (including impersonation writes), which pollutes the trail.

## What already exists (keeping as-is)

- `public.audit_logs` table with these columns: `id, user_id, org_id, action, table_name, record_id, previous_values, new_values, user_name, user_role, details, ip_address, created_at`. These are functionally identical to the requested `changed_by / organization_id / old_data / new_data` — renaming would break the existing UI (`useAuditLogs`, `LiveActivityFeed`, `ChangeDiffModal`, `ExportCsvButton`) and orphan existing rows. **Recommendation: keep the current column names.** The UI already renders them correctly. If you'd rather rename, say so and I'll extend the plan.
- RLS is already enabled with 4 policies (org-scoped SELECT + write-lockdown). Will verify no `anon`/`authenticated` INSERT/UPDATE/DELETE policy exists and tighten if needed.
- Realtime + query hook already stream new rows into the UI.

## Fix — single migration

### 1. Harden `log_audit_event()` to skip super admins

Update the existing function so its very first action is:

```sql
IF v_user_id IS NOT NULL AND public.is_super_admin() THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END IF;
```

Everything else (org resolution, user name/role lookup, JSONB diff, insert) stays the same. This means impersonation writes, super-admin cleanups, and support edits are excluded from tenant audit trails.

### 2. Attach `AFTER INSERT OR UPDATE OR DELETE` triggers

Wire the trigger to the critical tables. Since the project has no `loads` or `agent_crm` tables, I map to their actual names:

| Requested         | Attached to                                              |
| ----------------- | -------------------------------------------------------- |
| driver_settlements| `driver_settlements`                                     |
| loads             | `fleet_loads`, `agency_loads`                            |
| profiles          | `profiles`                                               |
| trucks            | `trucks`                                                 |
| agent_crm         | `crm_contacts`, `company_resources` (load agents live here) |

Pattern for each:

```sql
DROP TRIGGER IF EXISTS audit_<table> ON public.<table>;
CREATE TRIGGER audit_<table>
  AFTER INSERT OR UPDATE OR DELETE ON public.<table>
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
```

### 3. RLS sanity check

Verify (and if missing, add) a restrictive write-block:

```sql
-- Only SELECT is allowed for tenants; writes only via SECURITY DEFINER triggers (bypass RLS).
DROP POLICY IF EXISTS "No client writes to audit_logs" ON public.audit_logs;
CREATE POLICY "No client writes to audit_logs"
  ON public.audit_logs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
```

Keep the existing tenant-scoped SELECT policy untouched.

### 4. Compatibility notes

- Because `super_admin_delete_org` already sets `session_replication_role = replica` during org purges, these new triggers won't fire during cascade cleanups — safe.
- The existing UI (`src/pages/AuditTrail.tsx` + `src/hooks/useAuditLogs.ts` + `ChangeDiffModal`) already resolves `user_name` (with a legacy backfill from `profiles`) and renders a JSON before/after diff. Once triggers are attached, entries will flow in automatically — no frontend changes required.

## Files

- 1 new migration: `supabase/migrations/<ts>_audit_triggers_and_super_admin_skip.sql`

No frontend edits.