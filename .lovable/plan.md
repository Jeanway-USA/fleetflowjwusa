## Rebuild Audit Trail with PostgreSQL Triggers

Move audit capture from frontend/manual calls to database triggers so every INSERT/UPDATE/DELETE on core tables is recorded automatically.

### Task 1 — Schema (reuse existing `audit_logs`)
The table already exists with a compatible shape. Map requested columns → existing columns:
- `old_data` → `previous_values` (jsonb)
- `new_data` → `new_values` (jsonb)
- `changed_by` → `user_id` (uuid)
- `action`, `table_name`, `record_id`, `created_at`, `org_id` already present

No destructive changes. Only ensure `user_id` has an FK to `auth.users(id)` (add if missing).

### Task 2 — Generic trigger function
Create `public.log_audit_event()` (SECURITY DEFINER, `search_path=public`):
- Captures `TG_OP` → `action`, `TG_TABLE_NAME` → `table_name`
- `record_id` = `NEW.id` or `OLD.id`
- `previous_values` = `to_jsonb(OLD)` on UPDATE/DELETE
- `new_values` = `to_jsonb(NEW)` on INSERT/UPDATE
- `user_id` = `auth.uid()`
- `org_id` = `NEW.org_id`/`OLD.org_id` when the column exists, else `get_user_org_id(auth.uid())`
- `user_name` / `user_role` denormalized from `profiles` + `user_roles` (best-effort, null-safe)
- Skips writes when both OLD and NEW jsonb are identical (no-op updates)

### Task 3 — Attach triggers to core tables
`AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW EXECUTE FUNCTION log_audit_event()` on:
- `fleet_loads`, `agency_loads` (loads)
- `profiles`, `user_roles`
- `trucks`, `trailers`, `drivers`
- `crm_contacts` (agent/broker CRM)
- `driver_signed_documents`, `documents` (onboarding)
- `driver_settlements`, `driver_settlement_items`, `driver_payroll`, `expenses`, `truck_loan_payments` (financial)
- `work_orders`, `maintenance_requests`

Named `trg_audit_<table>` so they can be dropped/re-added idempotently. Existing bespoke audit triggers (e.g. `audit_sensitive_access`) will be dropped where superseded to prevent duplicate rows.

### Task 4 — Admin UI viewer
The `/audit-trail` page and `useAuditLogs` hook already read from `audit_logs`. Enhancements:
- `useAuditLogs`: resolve `user_id` → display name via a batched `profiles` lookup when `user_name` is null (covers historical rows).
- `LiveActivityFeed`: keep current row, ensure "View Details" opens the existing `ChangeDiffModal` (already renders `previous_values` vs `new_values` as a field-level diff). Wire it up if not already connected.
- No schema changes required in the UI layer.

### Out of scope
- Backfilling historical rows
- Storing IP address (requires request context not available inside triggers)
- Auditing high-churn tables (`driver_locations`, `load_status_logs`, `audit_logs` itself)

### Files
- New migration: create `log_audit_event()`, attach triggers, drop superseded ones
- `src/hooks/useAuditLogs.ts` — add profile-name fallback resolution
- `src/components/audit/LiveActivityFeed.tsx` — ensure row click opens `ChangeDiffModal`
