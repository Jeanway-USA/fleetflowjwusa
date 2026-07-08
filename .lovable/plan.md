# Fleet Maintenance Economic Loss & Down-Time Tracker

Wire economic loss and chronic-issue signals into maintenance so dispatch can see, in one glance, which trucks are bleeding money and which shouldn't be sent OTR.

## What's already there (leveraged, not rebuilt)

- `work_orders.days_down` column exists.
- `useTruckProfitability` already computes `totalDaysDown` × `avg_daily_truck_revenue` (`company_settings`, default 1000) and renders "True Cost of Maintenance" in the drawer's Unit P&L tab.
- What's missing: **live** down-days for in-progress repairs, opportunity-cost surfaced on the History card (not just P&L tab), chronic-issue detection, and a fleet-level warning pill.

## 1. `src/hooks/useMaintenanceData.ts`

Extend `useTruckHistory(truckId)` to also compute and return:

- `liveDaysDown` — for every work order with `status !== 'completed'`, `days_down = floor((today − entry_date) / 1 day)`; sum + list.
- `historicalDaysDown` — sum of `days_down` on completed work orders (all time).
- `avgDailyRevenue` — pulled from `company_settings.avg_daily_truck_revenue` (fallback **$800/day** per spec).
- `opportunityRevenueLost` — `(liveDaysDown + historicalDaysDown) × avgDailyRevenue`.
- `chronic` — `{ hasChronicIssue: boolean, count: number, entries: Array<{ id, source: 'log'|'work_order', description, date, category }>` }.
  - **Rule**: > 2 uncorrected minor updates in trailing 30 days. "Minor" = `service_type` in `{'fluid','tire','pressure','minor','inspection'}` OR description matches `/leak|drip|slow (tire|fluid)|pressure|weep/i`. "Uncorrected" = maintenance_logs not linked to a completed work_order for the same category **and** open work_orders with `priority in ('low','medium')`.

Add a new fleet-wide hook `useChronicIssueTrucks()` returning `{ truckIds: Set<string>, count: number }` using the same rule across all trucks (single joined query on `maintenance_logs` + `work_orders` scoped to last 30 days, then grouped by `truck_id`). Cached with the same query key family as other maintenance hooks; `staleTime: 5m`.

## 2. `src/components/maintenance/TruckHistoryDrawer.tsx`

On the **History** tab:

- Replace the 2-card stats grid with a 3-card grid, adding an **Opportunity Revenue Lost** card:
  - Big number: `formatCurrency(opportunityRevenueLost)`
  - Sub-line: `{liveDaysDown + historicalDaysDown}d down · ${avgDailyRevenue}/day target`
  - Tinted rose when > 0; muted when 0.
- Add an amber **High Vulnerability Index** badge in the `SheetHeader` next to the unit number when `chronic.hasChronicIssue` is true. Tooltip lists the offending entries (date + description + category). Uses the shared amber palette already used on the "Due Soon" pill.
- No changes to the Unit P&L tab (already displays 90-day lost revenue).

## 3. `src/components/maintenance/PMFleetHealthSummary.tsx`

- Call `useChronicIssueTrucks()` internally (keeps the change contained to these three files — no prop-drilling changes in `PreventiveMaintenanceTab`).
- Add a fourth pill after "On Track": **High Vulnerability** — amber, `ShieldAlert` icon, shows `{chronicCount} High Vulnerability`. Purely informational (no filter binding), with a tooltip: "≥ 3 uncorrected minor issues in last 30 days — avoid long OTR assignments."
- Hidden when `chronicCount === 0` so it doesn't add noise on healthy fleets.

## Constants

New file-local constant `DEFAULT_DAILY_REVENUE_TARGET = 800` in `useMaintenanceData.ts` used as fallback everywhere `avg_daily_truck_revenue` isn't set (also updates the existing `useTruckProfitability` fallback from 1000 → 800 for consistency with the spec).

## Out of scope

- No new tables, migrations, or columns.
- No changes to `PMScheduleFilters` / `HealthStatus` type (chronic pill is display-only).
- No changes to work-order creation UI or the `days_down` write path.
