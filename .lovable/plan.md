## Remove Synthetic/Sample Data from Finance Overview & Maintenance

The "false data" showing on Finance → Overview & P&L comes from hardcoded fallback constants that were added as demo scaffolding. This plan strips them out so every figure on the Overview reflects real database records, and does the same for the maintenance down-time opportunity cost added recently.

### 1. Finance Overview — "Fleet Runway · Cost-Per-Day vs Month-to-Date Revenue" card

This entire card is built from hardcoded values:

- `src/config/fixedOverhead.ts` — a hand-authored matrix (Unladen Liability $450, Communications $375, Physical Damage $1,200, Vehicle Lease $3,200, Baseline Driver Salary $5,200 → $10,425/mo fixed overhead) that no org actually configured.
- `src/hooks/usePLTrend.ts` — `DEFAULT_FUEL_PRICE = 4.10`, `DEFAULT_MILES_PER_DAY = 450`, `DEFAULT_DISPATCH_DAYS = 22`, `DEFAULT_MPG = 6.5` used to fabricate a runway when no real settings exist.

Changes:
- Delete `src/config/fixedOverhead.ts`.
- Delete the `FleetRunwaySection` component and its render in `src/components/finance/PLSummaryTab.tsx` (remove the `Target`/`FIXED_OVERHEAD_MATRIX` imports too).
- In `src/hooks/usePLTrend.ts`, drop the `runway` block, the fuel/miles/dispatch defaults, and the `RunwayMetrics` type. Keep the real rollups (`week`/`month`/`quarter`/`weekly`) that drive the KPI cards, Operational Ratios, and the 12-Week Trend chart — those are computed from real `fleet_loads`, `expenses`, `driver_payroll`, and `agent_commissions` rows.
- Remove the now-unused `fuelPricePerGallon`/`plannedMilesPerDay`/`plannedDispatchDays` reads from `PLSummaryTab.tsx`.

Result: Overview shows Gross Revenue, Dispatched Expenses, NOI, Operational Ratios (RPM/EPM/NPM), and the 12-week trend — all derived from the org's own tables. The synthetic runway/break-even gauge is gone.

### 2. Maintenance — Opportunity Revenue Lost

`src/hooks/useMaintenanceData.ts` uses `DEFAULT_DAILY_REVENUE_TARGET = 800` when no `daily_revenue_target` company setting is configured. That silently multiplies every down-day by an invented $800.

Changes:
- Remove the `DEFAULT_DAILY_REVENUE_TARGET` constant and both fallback sites (lines ~1204, ~1374).
- When the setting is missing or unparseable, treat the daily target as `0` so `opportunityRevenueLost` becomes `0` (no fabricated number). Down-day counts still display.
- Update `TruckHistoryDrawer` / `PMFleetHealthSummary` where the figure is rendered: when the target is `0`, show a small "Set daily revenue target in Settings to calculate lost revenue" hint instead of a dollar amount.

### 3. Sweep for other synthetic data

Verified other recent additions read from real tables:
- Dispatch timeline (`FleetTimelineScheduler`, `DriverStatusGrid`) — pulls loads, hometime, PM schedules from DB. No changes.
- Driver performance (`useDriverPerformanceData`, leaderboard, scorecards) — all metrics derived from `fleet_loads`, `incidents`, `driver_payroll`. No changes.
- `supabase/functions/demo-login` seeds the shared **demo** account only (`demo@fleetflow-tms.com`). That is the public "Try the demo" experience and is intentionally isolated to that user — left as-is unless you want it stripped too.

### Files touched
- delete `src/config/fixedOverhead.ts`
- edit `src/hooks/usePLTrend.ts`
- edit `src/components/finance/PLSummaryTab.tsx`
- edit `src/hooks/useMaintenanceData.ts`
- edit `src/components/maintenance/TruckHistoryDrawer.tsx`
- edit `src/components/maintenance/PMFleetHealthSummary.tsx`

Confirm whether the demo-login seed data (only visible when signing in as the demo account) should also be removed, or leave that intact.