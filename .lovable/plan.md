## Goal

Extend `src/pages/MaintenanceDashboardHome.tsx` with two new actionable widgets beneath the KPI row, replacing the current generic "Driver Fault Reports" card with a focused, triage-oriented layout.

## New layout

Below the KPI cards, the grid becomes:

```text
+----------------------------------------+----------------------+
| Today's Priorities (lg:col-span-2)     | Live Driver Alerts   |
+----------------------------------------+----------------------+
| PM Notifications (full width below)                           |
+---------------------------------------------------------------+
```

The existing PM Notifications card stays. The standalone `DriverFaultReportsPanel` card is removed (its functionality is superseded by the new Live Driver Alerts widget, which links into `/maintenance` for triage).

## Widget 1 — Today's Priorities (large)

Wrapped in a standard `<Card>` with `CardHeader` ("Today's Priorities" + small count badge) and `CardContent`.

- **Data source**: new `useTodaysWorkOrders()` hook in `src/hooks/useMaintenanceData.ts`. Queries `work_orders` where `status in ('open','parts_ordered','in_progress')` AND `entry_date = today` (YYYY-MM-DD), joining `trucks(unit_number)`, ordered by an urgency rank derived from `service_type` (tire/brake/repair → high, pm/inspection → medium, default → low).
- **Rendering**: minimalist `<Table>` (from `@/components/ui/table`) with columns: **Truck**, **Issue**, **Urgency**, **Action**.
  - Truck: `unit_number`
  - Issue: truncated `description ?? service_type`
  - Urgency: `<Badge>` — High = `destructive`, Medium = `outline` with warning token, Low = `secondary`
  - Action: `<Button size="sm">Start Work</Button>` (disabled when already `in_progress`)
- **Row hover**: `hover:bg-muted/50 transition-colors cursor-pointer`; clicking a row navigates to `/maintenance`.
- **Start Work**: new `useStartWorkOrder()` mutation that sets `status='in_progress'` and invalidates `active-work-orders`, `todays-work-orders`, `fleet-availability`. Uses `LoadingButton` for the pending state, toasts success/error.
- **Empty state**: small muted "No work orders scheduled for today." with a link to `/maintenance` to schedule one.
- **Loading**: 3 `Skeleton` rows.

## Widget 2 — Live Driver Alerts (warning-styled)

Wrapped in a `<Card>` with `className="border-destructive/40"`; `CardHeader` uses `bg-destructive/5 border-b border-destructive/20` and shows an `AlertTriangle` icon + title "Live Driver Alerts" + small caption "Unverified — needs triage".

- **Data source**: reuse `useDriverFaultReports()` and filter to `status === 'submitted'` (truly unresolved incoming). Show top 6 ordered by priority then recency (already sorted by hook).
- **Rendering**: vertical list of clickable rows (no table). Each row shows:
  - Priority dot/badge (critical/high = `destructive`, medium = `outline`, low = `secondary`)
  - Truck `unit_number` · driver first/last name
  - Issue type + first ~80 chars of description
  - Relative time (`formatDistanceToNow`)
- **Row hover**: `hover:bg-destructive/5 transition-colors cursor-pointer`, full row clickable → navigates to `/maintenance` (driver fault reports panel there handles the triage actions like Acknowledge / Convert / Delete).
- **Empty state**: muted "No new driver alerts." with a small green check icon.
- **Loading**: 3 `Skeleton` rows.
- Footer link "View all driver reports →" → `/maintenance`.

## Files changed

- `src/hooks/useMaintenanceData.ts` — add `useTodaysWorkOrders()` query + `useStartWorkOrder()` mutation.
- `src/pages/MaintenanceDashboardHome.tsx` — add `TodaysPrioritiesCard` and `LiveDriverAlertsCard` components in-file; restructure the second grid row; remove the standalone `DriverFaultReportsPanel` card; keep `PMNotificationsPanel`.

## Out of scope

- No DB migrations (uses existing `work_orders` + `maintenance_requests` tables/RLS).
- No changes to `/maintenance` page or to existing maintenance components.
- No changes to KPI cards or sidebar routing.
