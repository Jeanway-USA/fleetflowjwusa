
# Private TMS Pivot — JeanWay LLC

Convert the app from a public multi-tenant SaaS to a single-tenant, internal-only TMS. Root URL becomes a branded login. Only Admins and Drivers can access anything. All billing, marketing, tier gating, workspace-switching, and cross-org logic is removed.

## 1. Access model & routing

- **Root (`/`)** renders a minimalist JeanWay-branded login screen — email + password, no signup link, no marketing, no footer nav.
- Remove routes: Landing, Pricing, About, Contact, Public Load Tracker, all `/onboarding-wizard` org-creation flows, `/pending-access`, tier upgrade pages, promo-code pages, live-demo pages, beta-onboarding pages.
- Keep: driver onboarding (paperwork flow for new hires invited by admin), `/reset-password`.
- `ProtectedRoute` becomes a hard gate: authenticated + role in (`admin`, `driver`). Anyone else is signed out and returned to `/`.
- Signup is disabled at the client; admins create driver accounts via invitation only.

## 2. Roles (extensible, not booleans)

- Keep `app_role` enum but collapse the *active* set to `admin` and `driver`. Migrate every existing internal role (`owner`, `payroll_admin`, `dispatcher`, `safety`, `executive`, `maintenance`, `accountant`, `fleet_manager`) into `admin`. `super_admin` and impersonation are dropped.
- All helper functions (`has_role`, `is_owner`, `has_admin_access`, `has_payroll_access`, `has_operations_access`, `has_safety_access`) are consolidated into two: `public.is_admin(uuid)` and `public.is_driver(uuid)`, both reading from `user_roles` — no booleans on `profiles` or `drivers`.
- Future roles can be added by inserting new enum values + a matching helper, without code changes elsewhere.

## 3. Database teardown

**Data purge first** (single migration, wrapped in a transaction):
1. Identify JeanWay's `org_id` (I'll surface the candidates and ask you to confirm the exact UUID before I run the migration).
2. Hard-delete every row where `org_id <> :jeanway`. Order respects FKs; audit triggers are suppressed via `session_replication_role = replica`.

**Then strip multi-tenancy** (second migration):
- Drop tables: `organizations`, `invitations`, `org_storage_config`, `subscription_plans`, `promo_codes`, `super_admins`, `internal_config` (moved to edge-function env), `changelog`, `user_feedback`, `state_tax_configurations` (kept only if used by IFTA — I'll verify).
- Drop columns: `org_id` from every remaining table; `subscription_tier`, `stripe_*`, `trial_*`, `is_complimentary`, `tms_mode`, `is_active` from profile-adjacent tables.
- Drop functions: `get_user_org_id`, `is_super_admin`, all `super_admin_*`, `auto_cleanup_empty_orgs`, `super_admin_reset_demo`, org-setting triggers (`set_*_org_id`), `prevent_org_billing_self_update`, `storage_user_same_org`.
- Rewrite every RLS policy: replace `org_id = get_user_org_id(auth.uid())` with either `public.is_admin(auth.uid())` for admin-scoped tables or `driver_id = get_driver_id_for_user(auth.uid())` for driver-owned rows. Re-issue `GRANT`s.
- Rewrite storage bucket paths: `{org_id}/…` → `jeanway/…`; RLS on `storage.objects` checks `is_admin` / driver ownership only.

**Core tables kept and refocused**:
- `trucks`, `trailers`, `drivers`, `fleet_loads`, `expenses`, `fuel_purchases`, `maintenance_requests`, `work_orders`, `service_schedules`, `driver_payroll`, `driver_settlements`, `driver_banking_info`, `driver_w4_info`, `driver_i9_info`, `driver_w9_info`, `driver_ioo_agreement`, `driver_signed_documents`, `driver_locations`, `documents`, `crm_contacts` (renamed to `partners` — brokers/shippers/vendors), `audit_logs`, `profiles`, `user_roles`.

## 4. Sidebar restructure

New `AppSidebar` groups, collapsible-to-icon, active-route highlighted:

```text
Dispatch & Loads
  ├─ Load Board (active + upcoming)
  ├─ Load History
  └─ Create Load

Fleet & Maintenance
  ├─ Trucks & Equipment
  ├─ Trailers
  ├─ Maintenance Requests
  ├─ Work Orders
  └─ Telematics (ELD placeholder)

Drivers & Payroll
  ├─ Driver Roster
  ├─ Payroll Runs
  ├─ Settlements
  └─ Onboarding Invitations

Financials
  ├─ Fuel Card Transactions
  ├─ Expenses
  ├─ P&L per Truck
  └─ IFTA

Admin
  ├─ Partners (brokers / shippers / vendors)
  ├─ Documents
  ├─ Audit Log
  └─ Company Settings
```

Driver role sees only their own portal: My Loads, My Pay, My Documents, Profile.

## 5. UI/UX cleanup

- Remove from every menu, header, and settings page: Subscribe, Upgrade, Billing, Manage Plan, Trial banner, Beta banner, Impersonation banner, Workspace switcher, Org name in header (replaced with static "JeanWay LLC" wordmark), TMS-mode toggle, Feedback widget, Product Tour, Live-Demo pill.
- Header: JeanWay logo left, sidebar trigger, quick-search, notifications, avatar menu (Profile, Sign out).
- Theme: high-contrast dark corporate — deep slate background (`#0B1220`), steel surfaces (`#111827` / `#1F2937`), amber accent (`#F59E0B`) for JeanWay identity, white/near-white text. Uses existing HSL tokens in `index.css`; no hardcoded colors in components.
- Optimize for desktop/tablet (≥768px). Mobile still functional but not the target.

## 6. Files touched (high-level)

- Routes/layout: `src/App.tsx`, `src/pages/Auth.tsx` (new login), delete `src/pages/{Landing,Pricing,About,Contact,PublicLoadTracker,OnboardingWizard,PendingAccess,LiveDemo,BetaOnboarding,SubscriptionUpgrade}.tsx` + their components.
- Sidebar: `src/components/app-sidebar.tsx` rewritten; header stripped of tier/impersonation/switcher.
- Role helpers: `src/hooks/useRole.ts`, `src/hooks/useUserRole.ts` collapsed to `useIsAdmin()` / `useIsDriver()`.
- Delete folders: `src/components/subscription/`, `src/components/billing/`, `src/components/marketing/`, `src/components/admin/impersonation/`, `src/components/onboarding/wizard/` (org wizard only — keep driver onboarding), `src/components/tour/`, `src/components/feedback/`, `src/components/demo/`.
- Delete edge functions: `stripe-webhook`, `create-checkout-session`, `manage-subscription`, `promo-code-*`, `super-admin-*`, `impersonation-*`, `beta-onboarding-*`, `live-demo-*`.
- Theme tokens: `src/index.css` updated with JeanWay palette; `tailwind.config.ts` unchanged (all via CSS vars).
- Two migrations (data purge → schema teardown) + one migration for RLS rewrite.

## 7. Order of execution (I'll pause for approval before destructive steps)

1. Confirm JeanWay `org_id` from `organizations` table.
2. Snapshot existing admin/driver users we want to keep.
3. Migration A — data purge (irreversible).
4. Migration B — drop columns, tables, functions; add `is_admin`/`is_driver`; rewrite RLS + GRANTs.
5. Frontend refactor (routes, sidebar, header, theme, dead-code removal).
6. Delete unused edge functions.
7. Verify: log in as admin (full sidebar), log in as driver (portal only), confirm no billing/marketing surfaces, all core tables read/write under new RLS.

## 8. Out of scope

- Custom domain DNS setup for `tms.jeanwayusa.com` — already connected per project URLs; nothing to change here.
- Real ELD/telematics ingestion — only the UI placeholder + schema hook.
- New payroll features — existing W-2 flow stays intact, just minus billing plumbing.
- Data export of purged orgs (per your instruction, hard-delete).
