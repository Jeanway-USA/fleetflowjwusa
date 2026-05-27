## Goal

Add a dedicated Maintenance Staff home dashboard at `/maintenance-home` and route the Maintenance role there by default (from auth redirect and from the sidebar's "My Dashboard" entry). Existing `/maintenance` (work orders / PM / history) remains untouched.

## Files to create

### `src/pages/MaintenanceDashboardHome.tsx`
- Wrapped by `ProtectedRoute` in `App.tsx` (roles: `['owner', 'maintenance']`, `requiredFeature="maintenance_full"`).
- Uses `PageHeader` (title: "Maintenance Dashboard", description: "Performance & status overview") to match Executive/Dispatcher dashboards.
- Top section: "Performance & Status Overview" — responsive CSS grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6` with four KPI cards.
- Below the KPI grid, a second responsive grid `grid-cols-1 lg:grid-cols-3 gap-6` with placeholders for future widgets (Active Work Orders preview, Recent Driver Reports, Upcoming PM) using existing components (`ActiveWorkOrdersTab`, `DriverFaultReportsPanel`, `PMNotificationsPanel`) wrapped in `Card`s — kept lightweight so the home is informational and links to `/maintenance` for full management.

### KPI Card design (inline component within the page)
Each KPI card:
- `Card` + `CardHeader` (title + Lucide icon top-right, matching `MaintenanceKPICards`/`RevenueKPICards` style).
- Large metric number (`text-2xl sm:text-3xl font-bold`).
- Small trend row beneath: `ArrowUp` (green `text-emerald-600`) or `ArrowDown` (red `text-red-600`) + delta text + muted helper line.
- `Skeleton` while loading.

### Four KPIs (data sources, all already in `useMaintenanceData.ts`)
1. **Fleet Uptime** — `Truck` icon. `useFleetAvailability()` → `available / total * 100`. Trend: green if ≥95%, red below. Helper: "Target 95%+".
2. **Open Work Orders** — `Wrench` icon. `useActiveWorkOrders()` → `data.length`. Trend up = red (more), down = green; compared against count from 7 days ago (compute via simple filter on `entry_date`, or omit and show "Active now").
3. **Critical Driver Reports** — `AlertTriangle` icon. New small hook `useCriticalDriverFaultReports()` in `useDriverFaultReports.ts` (or reuse existing list filtered by `severity in ('high','critical')` AND `status` not in `('resolved','acknowledged')`). Red trend if > 0.
4. **Avg. Repair Turnaround** — `Clock` icon. New small hook `useAvgRepairTurnaround()` in `useMaintenanceData.ts`: query last 30 days of `work_orders` where `status='completed'`, average `(completed_at - entry_date)` in hours; display as hours (<48) or days. Trend vs prior 30-day window.

## Files to edit

### `src/App.tsx`
- Lazy import `MaintenanceDashboardHome`.
- Add route `/maintenance-home` (ProtectedRoute, roles `['owner','maintenance']`, feature `maintenance_full`).

### `src/components/shared/RoleBasedRedirect.tsx`
- Change `hasRole('maintenance')` redirect from `/maintenance` → `/maintenance-home`.

### `src/components/layout/AppSidebar.tsx`
- Maintenance dashboard-switcher entry (line 204): point "My Dashboard" to `/maintenance-home`.
- Update `pathToRole` map (line 207–211) to include `'/maintenance-home': 'maintenance'`.
- Add a sidebar nav item under the Maintenance section for "Maintenance Management" → `/maintenance` so the existing page stays reachable for maintenance role.

## Styling consistency
- Reuse the same card/header/typography conventions as `MaintenanceKPICards.tsx` and `RevenueKPICards.tsx` (CardHeader with title + icon, `text-sm font-medium` title, `text-2xl sm:text-3xl font-bold` metric, `text-xs text-muted-foreground` helper).
- Tailwind semantic tokens only; trend colors via `text-emerald-600` / `text-red-600` (already used in `MaintenanceKPICards`).
- Responsive: 1 col mobile → 2 col tablet → 4 col desktop for KPI row; lower widget grid 1 col mobile → 3 col desktop.

## Out of scope
- No DB migrations; all data sources already exist.
- No changes to `/maintenance` page itself.
- No tier-gating changes (reuses `maintenance_full`).