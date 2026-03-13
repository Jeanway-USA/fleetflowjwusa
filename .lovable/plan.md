

## Plan: Fix All Super Admin Views to Bypass RLS

### Problem
The `super_admin_dashboard_data`, `super_admin_audit_logs`, and `super_admin_usage_metrics` views all have `security_invoker = true`, which causes them to respect RLS policies on underlying tables (`organizations`, `audit_logs`, `fleet_loads`, etc.). This means the super admin only sees their own org's data in the Overview stats, System Health audit logs, and Engagement metrics.

The `super_admin_organizations` view was already fixed in the last migration. These three were missed.

### Fix
One database migration to recreate all three views with `security_invoker = false`. Each view already self-gates access via `WHERE is_super_admin()`, so security is maintained.

**Views to recreate:**
1. `super_admin_dashboard_data` — fixes Total Organizations count, signup counts, and Tier Distribution chart
2. `super_admin_audit_logs` — fixes System Health tab showing only own-org audit logs
3. `super_admin_usage_metrics` — fixes Engagement tab showing only own-org loads/trucks/drivers

### Migration SQL
```sql
-- 1. Dashboard data
DROP VIEW IF EXISTS public.super_admin_dashboard_data;
CREATE VIEW public.super_admin_dashboard_data
WITH (security_invoker = false) AS
  <same SELECT as current definition>;

-- 2. Audit logs
DROP VIEW IF EXISTS public.super_admin_audit_logs;
CREATE VIEW public.super_admin_audit_logs
WITH (security_invoker = false) AS
  <same SELECT as current definition>;

-- 3. Usage metrics
DROP VIEW IF EXISTS public.super_admin_usage_metrics;
CREATE VIEW public.super_admin_usage_metrics
WITH (security_invoker = false) AS
  <same SELECT as current definition>;

-- Revoke/grant on all three
REVOKE ALL ON public.super_admin_dashboard_data FROM anon, public;
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;
-- (repeat for other two)
```

### Files
- 1 database migration only, no code changes needed

