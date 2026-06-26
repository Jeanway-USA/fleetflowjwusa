## Status of Earlier Parts

- **Parts 1, 2, 3** were already implemented in the previous turns (active load priority on `DriverDashboard`, PU# orange badge + trailer # in `DriverLoadsView`, and `DriverSpectatorView` reusing the same components). No further work needed unless you've spotted a regression — tell me what's off and I'll patch it.

This plan focuses on **Parts 4 and 5** (Immutable Audit Log + Executive Audit Portal), which are net-new.

---

## Part 4 — Immutable Audit Log

### Extend existing `public.audit_logs` table

The table already exists with `id, user_id, action, table_name, record_id, details (jsonb), ip_address, created_at, org_id`. Add the missing columns rather than creating a parallel table (so existing writers — settlement audit, impersonation, banking decrypt, etc. — keep flowing into one place):

```sql
ALTER TABLE public.audit_logs
  ADD COLUMN user_name text,
  ADD COLUMN user_role text,
  ADD COLUMN resource_type text GENERATED ALWAYS AS (table_name) STORED,
  ADD COLUMN previous_values jsonb,
  ADD COLUMN new_values jsonb;
CREATE INDEX audit_logs_org_created_idx  ON public.audit_logs (org_id, created_at DESC);
CREATE INDEX audit_logs_table_idx        ON public.audit_logs (org_id, table_name, created_at DESC);
CREATE INDEX audit_logs_user_idx         ON public.audit_logs (org_id, user_id, created_at DESC);
```

### Append-only guardrail

```sql
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon, service_role;
CREATE POLICY "audit_logs_no_update" ON public.audit_logs FOR UPDATE USING (false);
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs FOR DELETE USING (false);
```
Existing SELECT policy (org members read their own org) is kept. INSERT continues to be performed only by SECURITY DEFINER triggers.

### Mutation triggers on critical tables

A single trigger function `public.audit_row_change()` (SECURITY DEFINER) writes one row per INSERT/UPDATE/DELETE, capturing:
- `user_id = auth.uid()`
- `user_name` = display name from `profiles`
- `user_role` = first role from `user_roles` for that org (admin/dispatcher/driver/etc.)
- `action` = `TG_OP`
- `table_name` = `TG_TABLE_NAME`
- `record_id` = `NEW.id` / `OLD.id`
- `previous_values`, `new_values` = `to_jsonb(OLD)` / `to_jsonb(NEW)`
- `org_id` from the row

Attach `AFTER INSERT OR UPDATE OR DELETE` triggers to: `fleet_loads`, `driver_settlements`, `settlements`, `drivers`, `trucks`, `trailers`. (Project has no `loads`/`equipment` tables — these are the real names.)

Existing `audit_sensitive_access()` writes thin rows; the new function supersedes it for these tables. Drop the old triggers where they overlap to avoid duplicates.

---

## Part 5 — Executive Audit Portal

### Route + RBAC
- New page `src/pages/AuditTrail.tsx` mounted at `/audit-trail`.
- `ProtectedRoute` guard: visible only when `is_owner(auth.uid())` OR `has_role('payroll_admin')` OR `is_super_admin()`. All other roles → redirect to `/401` (new lightweight unauthorized page; reuse `NotFound` styling).
- Sidebar (`AppSidebar.tsx`): add a "Security & Compliance" section with a single **Audit Trail** link, rendered only for the same roles.

### UI components (all under `src/components/audit/`)
1. **MetricsSnapshot** — two cards:
   - Total actions in last 24h
   - Critical overrides (DELETEs + settlement/driver UPDATEs) in last 24h
2. **LiveActivityFeed** — TanStack Query + Supabase Realtime subscription on `audit_logs` filtered by `org_id`. Virtualised list, newest first.
3. **AuditFilters** — controlled filter bar: user role, action type, date range (react-day-picker), free-text resource id / load number.
4. **ChangeDiffModal** — opens from a row's "View Changes" button. Renders a key-by-key diff of `previous_values` vs `new_values` with red/green highlighting; falls back to JSON pretty-print when only `details` is present (legacy rows).
5. **ExportCsvButton** — converts the currently filtered result set to CSV client-side (Blob + `URL.createObjectURL`).

### Data fetching
Single `useAuditLogs({ filters, page })` hook hitting `audit_logs` with the filter predicates server-side; joins `profiles` for user display name when `user_name` is null on legacy rows.

---

## Technical Notes

- **Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs` so the live feed streams.
- **Performance:** Trigger function is set `SECURITY DEFINER` with `search_path = public` and short-circuits when `auth.uid()` is null (system migrations) to avoid noise.
- **Storage growth:** Acceptable for current volume; we can add a partitioning plan later if needed — out of scope here.
- **Out of scope:** Rewriting existing dispatcher/admin UIs to emit application-level logs (DB triggers cover the mutation surface). Mobile-optimised audit UI (desktop-first per executive context, but responsive).

## Files to Create / Edit

- Migration (new) — schema, triggers, RLS, realtime publication.
- `src/pages/AuditTrail.tsx` (new)
- `src/pages/Unauthorized.tsx` (new, 401)
- `src/components/audit/MetricsSnapshot.tsx` (new)
- `src/components/audit/LiveActivityFeed.tsx` (new)
- `src/components/audit/AuditFilters.tsx` (new)
- `src/components/audit/ChangeDiffModal.tsx` (new)
- `src/components/audit/ExportCsvButton.tsx` (new)
- `src/hooks/useAuditLogs.ts` (new)
- `src/App.tsx` (route registration + guard)
- `src/components/layout/AppSidebar.tsx` (new menu section)
