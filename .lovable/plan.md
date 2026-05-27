## Goal

Add two more widgets to `src/pages/MaintenanceDashboardHome.tsx`: an "Upcoming Preventive Maintenance (Next 7 Days)" look-ahead list and a "Quick Actions" panel for common daily tasks.

## New layout

The existing bottom row (which currently holds the standalone PM Notifications card) becomes a 3-column grid:

```text
+----------------------------------------+----------------------+
| Today's Priorities (lg:col-span-2)     | Live Driver Alerts   |
+----------------------------------------+----------------------+
| Upcoming PM (Next 7 Days)              | Quick Actions        |
| (lg:col-span-2)                        |                      |
+----------------------------------------+----------------------+
```

The standalone `PMNotificationsPanel` card is removed from this page — its info is now surfaced by the new "Upcoming PM" widget (which is more focused and scoped to the next 7 days), and the full panel remains available on `/maintenance`.

## Widget — Upcoming Preventive Maintenance (Next 7 Days)

Wrapped in `<Card>` with `CardHeader` ("Upcoming Preventive Maintenance" + small "Next 7 days" caption + count badge) and `CardContent`.

- **Data source**: reuse existing `usePMNotifications()` hook. Filter to non-dismissed items where the service is due within 7 days. Two cases:
  - `unit === 'days'` and `days_or_miles_remaining <= 7` (includes overdue / negative values)
  - `unit === 'miles'` with `notification_type` of `'overdue'` or `'due_soon'` (treat as "imminent" since exact date isn't available)
  Sort: overdue first, then by ascending days remaining.
- **Rendering**: minimalist `<Table>` with columns **Truck**, **Service Type**, **Due Date**, **Status**.
  - Truck: `trucks.unit_number`
  - Service Type: `service_name` (e.g., Oil Change, 120-Day Inspection, Brake Service) — already comes from `pm_notifications.service_name`.
  - Due Date:
    - Days-based: compute `addDays(today, days_or_miles_remaining)` and format as `MMM d`. If negative, show "Overdue · MMM d".
    - Miles-based: show `"in <N> mi"` (no calendar date available).
  - Status indicator:
    - Overdue (negative days or `notification_type === 'overdue'`): red `AlertTriangle` icon + red text.
    - Due ≤ 48 hours (days-based with `days_or_miles_remaining <= 2`): amber `Clock` icon + amber text "Due soon".
    - Otherwise: muted `Calendar` icon.
- **Row hover**: `hover:bg-muted/50 transition-colors cursor-pointer`; clicking navigates to `/maintenance?tab=predictive` (matches existing PM panel behavior).
- **Empty state**: muted "No preventive maintenance due in the next 7 days." with `CheckCircle2` icon.
- **Loading**: 3 `Skeleton` rows.
- Footer link: "Open predictive service calendar →" → `/maintenance?tab=predictive`.

## Widget — Quick Actions

Wrapped in `<Card>` with `CardHeader` ("Quick Actions" + `Zap` icon) and `CardContent`. Single-column vertical stack of 4 full-width buttons with distinct lucide icons and a short helper line under each. Sized for easy tapping (default `h-12 sm:h-10`).

| Button | Variant | Icon | Behavior |
|---|---|---|---|
| Create New Work Order | `default` (primary) | `Wrench` + `Plus` | Opens `<NewWorkOrderSheet>` mounted inline on this page (local `open` state). On success it already invalidates `active-work-orders`. |
| Log Parts Usage | `secondary` | `Package` | Opens the same `NewWorkOrderSheet` (work orders are where parts/cost are logged today). Helper text: "Add parts & costs to a work order". |
| Message a Driver | `secondary` | `MessageSquare` | Navigates to `/maintenance` and the user can pick a driver fault report thread there (driver messaging lives inside `MaintenanceThread` which is launched from the driver fault reports panel). Helper text: "Open driver fault report threads". |
| Update Truck Status | `outline` | `Truck` | Navigates to `/trucks` where status can be edited. |

All four buttons use `w-full justify-start gap-3` with the icon at the left, label bold, and a small `text-xs text-muted-foreground` helper under the label.

## Files changed

- `src/pages/MaintenanceDashboardHome.tsx` — add in-file `UpcomingPMCard` and `QuickActionsCard` components, mount `NewWorkOrderSheet` once with local open state, restructure the grid below the "Today's Priorities / Live Driver Alerts" row, remove the standalone `PMNotificationsPanel` card.

## Out of scope

- No new DB tables, RPCs, or migrations.
- No new hooks — reuses `usePMNotifications`.
- No changes to `/maintenance`, `/trucks`, sidebar, or the KPI cards / other widgets already on the dashboard.
- No new "Log Parts" or standalone "Message Driver" pages — those map to existing flows as noted above.
