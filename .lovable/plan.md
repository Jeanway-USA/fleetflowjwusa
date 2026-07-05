## Goal
Frontend-only QoL update: regroup the sidebar into clearer sections and tighten role-scoping guarantees so drivers stay locked to their pages while all other privileged roles keep current access. No database, RLS, role enum, or org data changes.

## 1. Sidebar regrouping — `src/components/layout/AppSidebar.tsx`

Reorganize the collapsible groups (dashboards section stays as-is). New structure:

```text
Dashboards (unchanged)
  Executive View / Dispatcher View / Driver View / Maintenance View

Operations
  Fleet Loads
  Agency Loads
  Dispatcher Map (Dispatcher View already covers map; keep Fleet Loads/Agency Loads here)
  Trailers
  Trucks
  CRM (Broker / Agent)
  Drivers

Fleet Care
  Maintenance (Management)
  Maintenance Home (PM schedules live here)

Safety & Compliance   (kept separate per your choice)
  Safety
  Incidents
  Driver Performance
  Documents (Compliance Document Hub)

Administration
  Finance & P/L
  Company Insights
  IFTA Reporting  (independent mode only, unchanged gating)
  Audit Trail
  Settings (owners only, unchanged)
```

- Reuse existing `NavItem` entries — only move them between the `operationsItems`, new `fleetCareItems`, `safetyItems`, and renamed `administrationItems` arrays.
- Update `collapsibleGroups` to render four groups in this order; keep localStorage key `sidebar-groups` but seed defaults for the new `fleetcare` and renamed `administration` keys so nothing starts collapsed on first load.
- Keep all existing role/tier/tmsMode filters on each item — no widening of visibility.

## 2. Role routing hardening (frontend-only)

Interpretation confirmed: `admin` = any privileged role (owner, payroll_admin, dispatcher, safety, maintenance). No enum, RLS, or `user_roles` changes.

- Audit `src/App.tsx` route table and confirm every non-driver route already lists at least one privileged role in `allowedRoles` and never lists `driver` alongside privileged pages (spot-check: `/executive-dashboard`, `/finance`, `/insights`, `/ifta`, `/audit-trail`, `/settings`, `/maintenance`, `/documents`, `/safety`, `/incidents`, `/driver-performance`, `/trucks`, `/trailers`, `/drivers`, `/fleet-loads`, `/agency-loads`, `/crm`).
- Confirm driver-only routes (`/driver-dashboard`, `/driver/loads`, `/driver/settlements`, `/driver/onboarding`, `/driver-settings`, `/driver-stats`) only allow `driver` (and `owner` for view-as, which is intentional per existing simulation feature).
- If any route currently lists `driver` in a privileged page's `allowedRoles`, remove `driver` from that list. Based on the current `App.tsx` shown in context, none do — this step will likely be a no-op verification, and the plan section will simply document the audit result.
- No changes to `ProtectedRoute.tsx`, `RoleBasedRedirect.tsx`, `role-home.ts`, `AuthContext.tsx`, or `useSubscriptionTier.ts` — existing owner-can-see-everything + `hasRole` logic already implements the "admin toggles across all views" behavior via the dashboard switcher.

## 3. Data protection

- No SQL migrations. No edits to `supabase/`. No edits to `src/integrations/supabase/*`. No edits to `user_roles`, `organizations`, `profiles`, or any RLS policy.
- No page files created or deleted. No changes to data-fetching hooks.

## Files touched
- `src/components/layout/AppSidebar.tsx` — regroup nav arrays + add Fleet Care group + rename Back Office → Administration.
- `src/App.tsx` — only if the audit in step 2 finds a driver listed on a privileged route (expected: no change).

## Out of scope
- Any change to the `app_role` enum, `user_roles` table, or RLS.
- Any consolidation of real roles into a two-role model.
- Any new pages, dashboards, or backend endpoints.
