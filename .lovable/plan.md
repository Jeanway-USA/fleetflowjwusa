

## Super Admin Panel Expansion

### Overview
Add four major feature sets to the Super Admin Panel: enhanced tenant management, platform engagement metrics, infrastructure monitoring, and demo environment reset. All new database objects are protected by `is_super_admin()`.

---

### 1. Database Migration

Create a single migration with the following objects:

**A. Update `super_admin_update_org` RPC** to accept a `new_trial_ends_at` parameter:
```sql
CREATE OR REPLACE FUNCTION public.super_admin_update_org(
  target_org_id uuid,
  new_tier text DEFAULT NULL,
  new_is_active boolean DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL
)
...
  UPDATE organizations SET
    subscription_tier = COALESCE(new_tier, subscription_tier),
    is_active = COALESCE(new_is_active, is_active),
    trial_ends_at = COALESCE(new_trial_ends_at, trial_ends_at),
    updated_at = now()
  WHERE id = target_org_id;
```

**B. New RPC: `super_admin_get_owner_email`** -- returns the email of the owner for a given org:
```sql
CREATE OR REPLACE FUNCTION public.super_admin_get_owner_email(target_org_id uuid)
RETURNS text ...
  SELECT p.email FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.user_id
  WHERE p.org_id = target_org_id AND ur.role = 'owner'
  LIMIT 1;
```

**C. New View: `super_admin_usage_metrics`** -- platform-wide engagement data:
```sql
CREATE VIEW public.super_admin_usage_metrics AS
SELECT
  (SELECT count(*) FROM fleet_loads)::int AS total_fleet_loads,
  (SELECT count(*) FROM agency_loads)::int AS total_agency_loads,
  (SELECT count(*) FROM trucks)::int AS total_trucks,
  (SELECT count(*) FROM trailers)::int AS total_trailers,
  (SELECT count(*) FROM drivers)::int AS total_drivers,
  (SELECT json_agg(...) FROM (
    SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
    FROM fleet_loads
    WHERE created_at >= now() - interval '30 days'
    GROUP BY 1 ORDER BY 1
  )) AS loads_per_day_30d
WHERE is_super_admin();
```

**D. New RPC: `super_admin_storage_stats`** -- storage usage per bucket:
```sql
CREATE OR REPLACE FUNCTION public.super_admin_storage_stats()
RETURNS TABLE(bucket_id text, file_count bigint, total_bytes bigint)
...
  SELECT bucket_id, count(*), coalesce(sum((metadata->>'size')::bigint), 0)
  FROM storage.objects
  GROUP BY bucket_id;
```

**E. New RPC: `super_admin_reset_demo`** -- wipes and re-seeds demo data:
```sql
CREATE OR REPLACE FUNCTION public.super_admin_reset_demo()
RETURNS void ...
  -- Find demo org by owner email
  -- DELETE from all data tables WHERE org_id = demo_org_id
  -- Re-insert sample trucks, drivers, loads, expenses, CRM contacts, agency loads, commissions
```

Grant SELECT/EXECUTE to `authenticated`, revoke from `anon`.

---

### 2. New Components

#### A. `src/components/superadmin/OrgActionsDropdown.tsx`
A dropdown menu for the Organizations table Actions column, replacing the single "Simulate" button with:
- **Simulate** -- existing behavior
- **Manage Trial** -- opens a popover/dialog with a date picker for `trial_ends_at` and a toggle for activating/deactivating trial
- **Force Password Reset** -- calls `super_admin_get_owner_email` RPC, then uses `supabase.auth.resetPasswordForEmail()` to send a reset link. Wrapped in `toast.promise`.

All mutations use `useMutation` and invalidate `['super-admin-organizations']`.

#### B. `src/components/superadmin/EngagementTab.tsx`
New tab content that queries `super_admin_usage_metrics` and displays:
- **KPI Cards grid (2x2):**
  - Total Loads Processed (fleet + agency combined)
  - Active Fleet Size (trucks + trailers combined)
  - System-Wide Driver Count
  - Total Agency Loads
- **Bar Chart:** Recharts `BarChart` showing loads created per day over 30 days using the `loads_per_day_30d` array from the view.

#### C. `src/components/superadmin/InfrastructureTab.tsx`
New tab content that calls the `super_admin_storage_stats` RPC and displays:
- A `Table` with columns: Bucket Name, File Count, Total Size (formatted to MB/GB)
- A total row at the bottom

#### D. `src/components/superadmin/ResetDemoDialog.tsx`
An `AlertDialog` triggered by a destructive button in the page header:
- Requires the user to type "RESET" into an input field to confirm
- Calls the `super_admin_reset_demo` RPC on confirmation
- Uses `toast.promise` for feedback
- Invalidates all super-admin queries on success

---

### 3. Update `SuperAdminDashboard.tsx`

- Add two new tabs: "Engagement" and "Infrastructure" to the `TabsList`
- Import and render `EngagementTab` and `InfrastructureTab` in corresponding `TabsContent`
- Replace the Simulate `Button` in the Organizations table with `OrgActionsDropdown`
- Add `ResetDemoDialog` triggered from a destructive button in the `PageHeader` children slot
- Add `selectedLog`/`logSheetOpen` state is already present

---

### 4. Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | New migration with all SQL objects |
| `src/components/superadmin/OrgActionsDropdown.tsx` | New -- dropdown with trial management + password reset |
| `src/components/superadmin/EngagementTab.tsx` | New -- usage metrics tab |
| `src/components/superadmin/InfrastructureTab.tsx` | New -- storage monitoring tab |
| `src/components/superadmin/ResetDemoDialog.tsx` | New -- demo reset confirmation dialog |
| `src/pages/SuperAdminDashboard.tsx` | Updated -- new tabs, dropdown, reset button |

---

### Technical Details

**Trial Management in OrgActionsDropdown:**
- Uses a `Popover` with a date picker (`Calendar` component from shadcn) for the trial end date
- Switch component to toggle trial active/inactive (sets `trial_ends_at` to `null` or a future date)
- Mutation calls `super_admin_update_org` with the `new_trial_ends_at` parameter

**Password Reset:**
- First fetches owner email via `super_admin_get_owner_email` RPC
- Then calls `supabase.auth.resetPasswordForEmail(email)` client-side (this is a public Supabase Auth method that sends the reset link)
- Wrapped in `toast.promise` for clear admin feedback

**Storage Stats Formatting:**
```typescript
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
```

**Demo Reset RPC approach:** The `super_admin_reset_demo` function will:
1. Find the demo org by querying `profiles` + `auth.users` for the demo email
2. Delete all data from: `fleet_loads`, `agency_loads`, `agent_commissions`, `expenses`, `trucks`, `drivers`, `crm_contacts`, `trailers`, `fuel_purchases`, `work_orders`, `maintenance_logs`, `driver_notifications`, `driver_requests`, `detention_requests`, `maintenance_requests`, `ifta_records`, `driver_performance_metrics`, `hos_logs`, `driver_inspections`, `service_schedules`, `driver_settings` WHERE `org_id = demo_org_id`
3. Re-insert the same seed data from the `demo-login` edge function (trucks, drivers, loads, expenses, CRM contacts, agency loads, commissions)
4. Update the org `subscription_tier` back to `all_in_one`

