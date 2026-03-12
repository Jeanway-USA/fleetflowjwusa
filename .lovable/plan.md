

## Plan: Comprehensive RLS Security Hardening

### Critical Vulnerabilities Found

The security scan revealed a **critical privilege escalation** vulnerability: role-checking functions (`is_owner`, `has_role`, `has_operations_access`, etc.) query `user_roles` without filtering by `org_id`. Combined with the unrestricted `profiles` UPDATE policy, an attacker who is an owner in their own org can set their `profiles.org_id` to any target org and gain full access to that org's data.

### Migration: Database Security Fixes

A single migration will address all findings. Here is what it will contain:

**Fix 1 — Patch role-checking functions to filter by org_id** (Critical)

Update all 6 role-checking functions to include `AND org_id = get_user_org_id(_user_id)`:
- `is_owner(_user_id)` 
- `has_role(_user_id, _role)`
- `has_admin_access(_user_id)`
- `has_operations_access(_user_id)`
- `has_payroll_access(_user_id)`
- `has_safety_access(_user_id)`

This closes the escalation path: even if a user somehow changes their `org_id`, their roles won't match the new org.

**Fix 2 — Restrict profiles UPDATE to prevent org_id tampering** (Critical)

Replace the unrestricted `'Users can update their own profile'` policy with one that adds a `WITH CHECK` ensuring `org_id` cannot be changed:
```sql
WITH CHECK (auth.uid() = user_id AND (org_id IS NOT DISTINCT FROM get_user_org_id(auth.uid())))
```

**Fix 3 — Restrict promo_codes SELECT to authenticated users**

Drop the `'Anyone can view promo codes'` policy (which uses `USING (true)` for `{public}`) and replace it with one scoped to `{authenticated}`.

**Fix 4 — Fix `driver_settings_safe` view security**

Recreate the `driver_settings_safe` view with `security_invoker = true` so it inherits the base table's RLS policies instead of running as the view creator.

**Fix 5 — Restrict `organizations` INSERT policy**

The current `WITH CHECK (true)` allows any authenticated user to insert arbitrary orgs. Tighten to only allow insertion during onboarding (this is already handled by the `create_onboarding_org` RPC, so we can restrict the direct INSERT policy).

**Fix 6 — Add explicit RLS gating on super_admin views**

The super_admin views (`super_admin_dashboard_data`, `super_admin_organizations`, `super_admin_usage_metrics`, `super_admin_audit_logs`) already self-gate with `WHERE is_super_admin()` in their SQL definitions. However, to be defense-in-depth, revoke `SELECT` on these views from `anon` and non-super-admin roles.

### Frontend: Graceful RLS Error Handling

No major frontend changes needed — the app already uses `ErrorBoundary` wrappers and `ProtectedRoute` guards. However, one minor improvement:

**File: `src/integrations/supabase/client.ts`** — Cannot edit (auto-generated).

**File: Data-fetching hooks** — Most hooks already handle empty arrays gracefully. The existing `RoleBasedRedirect` and `ProtectedRoute` components handle unauthorized access at the routing level. No changes required.

### Storage Bucket Hardening

Current storage policies for `documents`, `dvir-photos`, `dvir-signatures`, and `branding-assets` are already properly scoped. Two improvements:
- Add org-scoped folder structure enforcement for `documents` bucket uploads (ensure the folder path includes the org_id)
- Tighten `dvir-photos` and `dvir-signatures` upload policies to scope by user folder

### Summary of Changes

| Change | Severity | Type |
|--------|----------|------|
| Patch 6 role-checking functions with org_id filter | Critical | Migration |
| Restrict profiles UPDATE WITH CHECK | Critical | Migration |
| Restrict promo_codes SELECT to authenticated | Medium | Migration |
| Fix driver_settings_safe view security_invoker | Medium | Migration |
| Tighten organizations INSERT policy | Low | Migration |
| Revoke anon access to super_admin views | Low | Migration |
| Storage: org-scoped document uploads | Low | Migration |

All changes are additive — no tables are dropped, only `CREATE OR REPLACE FUNCTION`, `DROP POLICY` + `CREATE POLICY`, and `CREATE OR REPLACE VIEW` statements.

