# Production Readiness Lockdown

A four-part sweep to harden access control, verify backend isolation, purge removed-feature code, and finish performance polish.

## Task 1 — RBAC Routing Lockdown

**Goal:** strict role segregation; bad URLs bounce to the user's role-home with a toast.

1. **New helper `src/lib/role-home.ts`** — single source of truth for "where does this role belong?":
   - owner → tier-aware (current logic from `RoleBasedRedirect`)
   - dispatcher → `/dispatcher-dashboard`
   - driver → `/driver-dashboard`
   - maintenance → `/maintenance-home`
   - safety / payroll_admin → `/executive-dashboard`
2. **Refactor `RoleBasedRedirect.tsx`** to use the helper.
3. **`ProtectedRoute.tsx` upgrade** — when role check fails, instead of `<Navigate to="/" replace />` (which silently re-routes), fire a sonner toast `"You don't have access to that page"` once per redirect, then navigate to the caller's role-home via the helper. Use a `useEffect` guard so the toast fires exactly once.
4. **Tighten allowed-role lists** on routes:
   - `/trucks`, `/trailers` → drop `dispatcher`; keep `owner, safety, maintenance` (maintenance needs read for service).
   - `/drivers` → drop `dispatcher, safety` (leave `owner, payroll_admin`).
   - `/fleet-loads` → remove `driver` (drivers use `/driver-dashboard` only).
   - `/crm` → remove `driver, safety`.
   - `/documents` → remove `driver` (drivers see their own docs via dashboard).
   - `/load-optimizer`, `/agency-loads` → owner + dispatcher only (already correct).
   - `/incidents`, `/driver-performance`, `/driver-view/:id` → remove `dispatcher` (safety/owner only).
   - `/maintenance` → owner + maintenance only (drop `safety`).
   - Confirm `maintenance` role is **not** in any finance, CRM, loads, dispatch, executive, or driver-mgmt route.
5. **Maintenance landing** = `/maintenance-home`; sidebar (`AppSidebar.tsx`) — hide every nav item except Maintenance Home, Maintenance, Trucks, Trailers, Safety Bonus settings when role is `maintenance`.

## Task 2 — RLS Verification + Migrations

**Audit (frontend):** every driver-facing query must filter by the authed user's driver id. Files to verify and patch if missing `.eq('driver_id', myDriverId)` or equivalent:
- `DriverDashboard.tsx`, `DriverLoadsView.tsx`, `ActiveLoadCard.tsx`, `DriverPayWidget.tsx`, `WeeklyPerformanceWidget.tsx`, `MyPaystubsDialog.tsx`, `DriverNotifications.tsx`, `DriverRequestsCard.tsx`, `LocationSharing.tsx`, `GeofenceArrivalDrawer.tsx`, `ProofOfDeliveryDialog.tsx`, `DriverStats.tsx`, `DriverSettings.tsx`, `DriverOnboarding.tsx`.
- Spot-check confirms most already scope by `driver_id`; add explicit filters anywhere only `org_id` RLS is relied on.

**Migration — RLS tighten (single migration):** for each table below, drop any policy that lets drivers see siblings' rows and replace with strict `driver_id = get_driver_id_for_user(auth.uid())` policies for the `driver` role. Admin/owner policies preserved.
- `fleet_loads` — driver SELECT/UPDATE limited to assigned loads (already via trigger; ensure RLS matches).
- `driver_payroll`, `driver_settlements`, `driver_settlement_items` — driver SELECT only own rows; no INSERT/UPDATE/DELETE for drivers.
- `driver_signed_documents` (1099 / compliance) — driver SELECT/INSERT own rows only.
- `driver_notifications`, `driver_requests`, `driver_settings`, `driver_locations`, `detention_requests`, `documents`, `driver_banking_info` — driver scope = own rows.

After migration, run `supabase--linter` and address new findings related to changes.

## Task 3 — Dead-Code & UI Purge (hard delete + fix references)

**Delete files**
- `src/components/finance/PayrollTab.tsx` (legacy, replaced by DriverSettlementsTab; not imported anywhere live).
- Any orphan inspection/fuel-stop/profile/duplicate-load components if found during refactor pass (current scan shows none in `src/components` or `src/pages`).

**Drop unused DB tables (migration, second statement set):**
- `driver_inspections`, `inspection_photos` (pre/post-trip)
- `fuel_stops_cache` (fuel stop uploads — referenced only in generated types)
- `hos_logs` (HOS already removed from UI per core memory)

Regenerated `types.ts` will auto-drop the orphan type entries.

**Code cleanup**
- Remove `driver_inspections`, `inspection_photos`, `fuel_stops_cache`, `hos_logs` references from `useDriverPerformanceData.ts`, `ExecutiveDashboard.tsx`, `DispatcherAlerts.tsx`, `AuditLogDetailSheet.tsx`, `tour-steps.ts`.
- Note: settlement-style "deductions" in `SettlementsTab.tsx` / `DriverSettlementsTab.tsx` are **kept** — those are settlement reconciliation line items (escrow, advances), not the removed driver-deductions feature. Only the legacy `PayrollTab` deductions UI is removed.
- Verify no remaining imports of deleted files (`rg` sweep), fix any breakage.

## Task 4 — Lazy-Loading Polish

- Re-scan with `rg` for direct (non-lazy) imports of: `recharts`, `leaflet`/`react-leaflet`, `jspdf`, `html2canvas`, `xlsx`, `qrcode`, `signature_pad`. Anything still eager gets wrapped via `React.lazy` + `<Suspense>` using the existing `LazyFallbacks.tsx` skeletons.
- Audit list of suspects to confirm/lazy-fix:
  - `PrintableExecutiveSummary.tsx`, `IFTAPrintSummary.tsx` (jspdf)
  - `JurisdictionMap.tsx`, `LoadRouteMap.tsx` (leaflet) — confirm lazy
  - `MorningBriefingWidget`, `CostBreakdownChart`, `RevenueTrendsChart`, `PerformanceCharts` (recharts)
  - `SignaturePad.tsx` (signature_pad lib)
- Verify no regression on mobile preview routes (`/driver-dashboard`, `/fleet-loads`).

## Out of Scope

- No new features. No design changes.
- No edits to onboarding/auth flow.
- Settlement deductions stay (they're not the "driver deductions" feature).
- Edge-function code untouched unless an RLS change forces a payload tweak.

## Verification

1. Build passes; `tsc` clean after types regen.
2. Manual route-spoof check: visit `/finance` as driver → toast + redirect to `/driver-dashboard`; visit `/fleet-loads` as maintenance → toast + redirect to `/maintenance-home`.
3. `supabase--linter` clean for touched tables.
4. Bundle: confirm `recharts`/`leaflet`/`jspdf` no longer in main chunk (vite build output).

```text
RBAC ─────────►  role-home.ts  ──► ProtectedRoute (toast+redirect)
RLS  ─────────►  migration: driver_id-scoped policies
PURGE ────────►  drop tables + delete PayrollTab + clean refs
LAZY ─────────►  recharts / leaflet / jspdf wrapped via LazyFallbacks
```
