# Restore RBAC Access & Owner Override

## Diagnosis

The previous lockdown enforces `allowedRoles` strictly via `hasRole()`. Owner is listed on most routes, but **not** on driver-only routes (`/driver-dashboard` actually does include owner, but `/driver-settings`, `/driver-stats`, `/driver/onboarding`) or maintenance-only contexts. Result: Owner sees access-denied toast + redirect when navigating to any driver/maintenance-specific page.

Additionally, `ProtectedRoute.hasAccess` does not short-circuit for owners — there is no "owner can see everything" rule in code.

## Task 1 — Owner global access (frontend)

**`src/components/shared/ProtectedRoute.tsx`**
- Change `hasAccess` so owners always pass: `const hasAccess = hasRole('owner') || allowedRoles.some(r => hasRole(r));`
- Keep role-simulation behavior intact (the existing `hasRole` already returns the simulated role only — owners who actively simulate a Driver role will still be scoped, which is correct).
- Confirm non-owner roles (driver, dispatcher, maintenance, safety, payroll_admin) continue to be redirected via `getRoleHomePath` when they hit an unauthorized route.

**`src/lib/role-home.ts`** — no change needed; owner branch already routes by tier.

**`src/components/layout/AppSidebar.tsx`** — audit the nav-item `allowedRoles` arrays the same way: owners should see every link. Add an `isOwner` short-circuit when rendering items (single one-line change at the filter site).

No other routing files change. No changes to `AuthContext` role-loading (it already loads roles correctly and exposes `hasRole`).

## Task 2 — Profile/role read access (RLS)

Verify via `supabase--read_query` that these policies exist and are `PERMISSIVE` for `authenticated`:
- `profiles`: `SELECT USING (user_id = auth.uid())`
- `user_roles`: `SELECT USING (user_id = auth.uid())`
- `organizations`: `SELECT USING (id = get_user_org_id(auth.uid()))`

If any are missing or restrictive, emit a single migration to add the self-read policies (and matching `GRANT SELECT ... TO authenticated`). Existing 9 profile policies and 6 user_roles policies suggest these are already present; the migration will be a no-op guard (`DROP POLICY IF EXISTS ... ; CREATE POLICY ...`) rather than schema churn.

## Task 3 — Owner override on major tables (RLS)

Add a permissive owner-bypass policy to the tables the user named plus the obvious siblings, all keyed on `is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid())` (so owners stay tenant-scoped, not cross-tenant):

- `fleet_loads`, `agency_loads`, `load_accessorials`, `load_expenses`, `load_status_logs`
- `trucks`, `trailers`, `trailer_assignments`
- `safety_bonus_settings`, `safety_bonus_tiers`
- `drivers`, `driver_payroll`, `driver_settlements`, `driver_settlement_items`, `driver_performance_metrics`
- `work_orders`, `maintenance_logs`, `service_schedules`, `parts_inventory`

For each: one migration that adds `"Owners can manage all <table>"` policies `FOR ALL TO authenticated USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid())) WITH CHECK (...)`. These are **additive PERMISSIVE** — they OR with existing self-scoped policies, so drivers still see only their own rows. Existing GRANTs already cover `authenticated`.

Sensitive PII tables (`driver_banking_info`, `incident_witnesses`) are intentionally **excluded** — they keep their tighter helper-function policies and audit triggers.

## Verification

1. `supabase--linter` clean after migration.
2. Log in as Owner → visit `/driver-dashboard`, `/driver-settings`, `/maintenance-home`, `/safety`, `/incidents`, `/drivers` → no toast, no redirect, page renders.
3. Log in as Driver → visiting `/finance` still redirects with toast.
4. Log in as Owner → finance/loads queries return all org rows (confirms RLS owner-bypass).
5. `supabase--read_query` spot-check: owner SELECT on `fleet_loads` returns rows where `driver_id` is null/other-driver.

## Out of scope

No changes to: auth flow, role simulation, super-admin guard, edge functions, design/UI, sidebar nav structure (only the role-filter short-circuit).
