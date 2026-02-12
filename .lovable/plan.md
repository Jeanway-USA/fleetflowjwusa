

# RLS Audit: Multi-Tenant Data Isolation

## Critical Finding

**Every single RLS policy in the database is missing `org_id` isolation.** This means an owner, dispatcher, or any admin-level user from Company A can currently read and modify ALL data from Company B, Company C, and every other organization.

The `org_id` column was added to 37 tables during Phase 1, but none of the existing RLS policies were updated to include the `org_id = get_user_org_id(auth.uid())` check. The `get_user_org_id()` helper function exists but is unused outside the `organizations` table itself.

---

## Detailed Breakdown

### Severity: CRITICAL -- Complete cross-tenant data leakage

Every policy below checks only role (e.g., `is_owner(auth.uid())`) without scoping to the user's organization. An owner from Org A passes `is_owner()` and sees ALL rows across ALL orgs.

### Tables with org_id but NO org_id in any RLS policy (37 tables):

| Category | Tables |
|----------|--------|
| Core Operations | `fleet_loads`, `trucks`, `trailers`, `drivers`, `expenses` |
| Financial | `settlements`, `settlement_line_items`, `driver_payroll`, `general_ledger`, `agent_commissions`, `load_expenses` |
| Agency | `agency_loads` |
| CRM | `crm_contacts`, `crm_contact_loads`, `crm_activities` |
| Driver Data | `driver_inspections`, `driver_notifications`, `driver_requests`, `driver_settings`, `driver_locations`, `driver_performance_metrics`, `detention_requests`, `hos_logs` |
| Safety | `incidents`, `incident_photos`, `incident_witnesses`, `inspection_photos`, `maintenance_requests` |
| Documents | `documents` |
| IFTA/Fuel | `ifta_records`, `fuel_purchases`, `fuel_stops_cache` |
| Other | `company_resources`, `company_settings`, `profiles`, `audit_logs`, `load_accessorials` |

### Tables missing org_id entirely (also need migration):

| Table | Risk |
|-------|------|
| `load_status_logs` | Cross-tenant load history visible |
| `maintenance_logs` | Cross-tenant maintenance data visible |
| `service_schedules` | Cross-tenant PM schedules visible |
| `work_orders` | Cross-tenant work orders visible |
| `pm_notifications` | Cross-tenant PM alerts visible |
| `manufacturer_pm_profiles` | Shared reference data (may be acceptable) |
| `facilities` | Cross-tenant facility data visible |
| `trailer_assignments` | Cross-tenant assignment history visible |
| `user_roles` | Owner from Org A can manage roles for Org B users |

### Helper functions lack org scoping:

The functions `is_owner()`, `has_operations_access()`, `has_payroll_access()`, `has_safety_access()`, and `has_admin_access()` all query `user_roles` without any `org_id` filter. While they correctly identify if a user HAS a role, they do not restrict what DATA that role can access. The data restriction must come from the table-level RLS policies themselves.

Similarly, `get_driver_id_for_user()` returns a driver record without org scoping, so a driver-level policy like `driver_id = get_driver_id_for_user(auth.uid())` is safe only because a user's driver record is unique to them -- but admin-level policies that use `has_operations_access()` without org filtering are fully exposed.

---

## Remediation Plan

### Step 1: Add org_id to missing tables (migration)

Add `org_id uuid REFERENCES public.organizations(id)` to:
- `load_status_logs`
- `maintenance_logs`
- `service_schedules`
- `work_orders`
- `pm_notifications`
- `facilities`
- `trailer_assignments`

Backfill with the existing JeanWay org UUID.

### Step 2: Update ALL admin-level RLS policies to include org_id check

For every policy that uses `is_owner()`, `has_operations_access()`, `has_payroll_access()`, `has_safety_access()`, or `has_admin_access()`, add `AND org_id = get_user_org_id(auth.uid())`.

**Example transformation:**

Before:
```sql
-- Owner dispatcher can manage fleet loads
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
```

After:
```sql
USING (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role))
  AND org_id = get_user_org_id(auth.uid())
)
```

This must be applied to approximately 80+ policies across all 37+ tables.

### Step 3: Update driver-scoped policies for defense-in-depth

While driver-scoped policies (e.g., `driver_id = get_driver_id_for_user(auth.uid())`) are not directly exploitable cross-tenant (a user can only match their own driver record), adding `AND org_id = get_user_org_id(auth.uid())` provides defense-in-depth.

### Step 4: Secure user_roles table

Add org-scoping to `user_roles` policies. Currently `is_owner(auth.uid())` on user_roles means an owner from Org A can manage roles for users in Org B. Options:
- Add `org_id` to `user_roles` and filter by it
- Or join through `profiles` to verify the target user belongs to the same org

### Step 5: Secure profiles table

The current profiles SELECT policy uses `has_admin_access(auth.uid())` with no org filter, meaning any admin can view all profiles across all organizations. Add org_id scoping.

### Step 6: Update INSERT policies with_check

All INSERT policies must include `WITH CHECK (org_id = get_user_org_id(auth.uid()))` to prevent users from inserting data into another organization's namespace.

---

## Technical Implementation

This will be a single large migration that:

1. Drops and recreates all affected RLS policies with org_id conditions
2. Adds org_id to the ~8 tables currently missing it
3. Backfills org_id on new tables
4. Adds org_id to `user_roles` for cross-tenant role management prevention

The migration will be structured as a single transaction to ensure atomicity.

### Estimated scope:
- ~80 policy rewrites
- ~8 table alterations
- ~8 backfill statements
- 1 new column on `user_roles`

This is a large but essential security fix. No code changes are needed on the frontend -- the RLS policies are enforced server-side regardless of what the client sends.

