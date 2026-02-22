

## Super Admin Panel

### Overview
Build a system-wide monitoring panel restricted to `andrew@jeanwayusa.com` and `siadrak@jeanwayusa.com`, using `SECURITY DEFINER` views to bypass org-scoped RLS without modifying existing policies.

### 1. Database Migration

Create a migration with:

**`is_super_admin()` function:**
```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') IN ('andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com'),
    false
  )
$$;
```

**`super_admin_dashboard_data` view** (SECURITY DEFINER) -- aggregates:
- Total org count
- Tier distribution (solo_bco, fleet_owner, agency, all_in_one)
- Signups in last 7 and 30 days

**`super_admin_organizations` view** (SECURITY DEFINER) -- lists all orgs (id, name, subscription_tier, created_at, user count) with `WHERE is_super_admin()`.

**`super_admin_audit_logs` view** (SECURITY DEFINER) -- exposes the 50 most recent `audit_logs` rows across all orgs with `WHERE is_super_admin()`.

Grant SELECT on all three views to the `authenticated` role; revoke from `anon`.

### 2. Frontend Components

**`src/components/shared/SuperAdminGuard.tsx`**
- Checks `user.email` against the two approved emails
- If not matched, redirects to `/`
- Renders children if authorized

**`src/pages/SuperAdminDashboard.tsx`**
- Three-tab layout using shadcn Tabs

**Tab 1 -- Overview:**
- KPI cards (total orgs, 7-day signups, 30-day signups)
- Recharts PieChart showing tier distribution
- Uses `gradient-gold` and `glow-gold` theme classes

**Tab 2 -- Organizations List:**
- DataTable fetching from `super_admin_organizations`
- Columns: Org Name, Tier (StatusBadge), Created Date, User Count
- "Simulate Org" button per row -- sets a local state/context override so the admin can browse as that org (UI-only, similar to existing role simulation pattern)

**Tab 3 -- System Health:**
- Table showing 50 most recent audit_log entries (timestamp, user_id, action, table_name, details)

### 3. Routing

In `App.tsx`, add:
```tsx
<Route path="/super-admin" element={
  <SuperAdminGuard>
    <DashboardLayout>
      <SuperAdminDashboard />
    </DashboardLayout>
  </SuperAdminGuard>
} />
```

This route is outside `ProtectedRoute` to avoid role-based blocking, but `SuperAdminGuard` enforces its own auth + email check.

### 4. Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/...super_admin.sql` | Create -- function + 3 views |
| `src/components/shared/SuperAdminGuard.tsx` | Create |
| `src/pages/SuperAdminDashboard.tsx` | Create |
| `src/App.tsx` | Modify -- add `/super-admin` route |

### 5. Constraints
- No changes to existing RLS policies on `organizations`, `profiles`, `audit_logs`, etc.
- All cross-tenant reads go through SECURITY DEFINER views gated by `is_super_admin()`
- TanStack Query for all data fetching
- Consistent use of `gradient-gold` / `glow-gold` theme utilities

