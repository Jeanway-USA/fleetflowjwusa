## Goal
Convert `PLSummaryTab.tsx` into a true executive P&L workspace with three KPI cards, a timeframe-aware CPM calculator, and a 12-week revenue-vs-expense trend chart. Existing detail tables (Revenue Summary, Miles Summary, Net Profit Calculation) stay below the new executive header so nothing in the workflow is lost.

## Scope (frontend only)
Files touched:
- `src/components/finance/PLSummaryTab.tsx` — add executive header (KPIs + CPM + chart) above current content.
- `src/hooks/usePLTrend.ts` *(new)* — fetches the last 12 ISO weeks of loads, expenses, and payroll for the current org and rolls them up per week + per timeframe.

No new DB tables, no edits to `Finance.tsx` props, no business-logic changes to existing totals.

## Layout

```
┌─────────────── EXECUTIVE P&L ───────────────┐
│  [Gross Revenue]  [Combined Costs]  [NOI / Margin] │
│                                                    │
│  CPM Calculator   Week ▾ Month ▾ Quarter ▾        │
│   RPM  $X.XX     EPM  $X.XX     NPM  $X.XX        │
│                                                    │
│  ┌──────── Revenue vs Expenses (12w) ────────┐   │
│  │  area/line chart, x = ISO week, y = $     │   │
│  └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘

(existing Revenue Flow strip + Revenue Summary / Miles Summary / Net Profit Calculation render below, unchanged)
```

## Section specs

### 1. Triple KPI blocks
Three `Card`s in a `grid-cols-1 md:grid-cols-3 gap-4` row.

- **Fleet Top-Line Gross Revenue** = `revenueTotals.grossRevenue` (sum of all completed load earnings — already aggregated upstream from delivered loads). Icon: `DollarSign` in `text-success`.
- **Combined Fleet Overhead Costs** = `totalExpenses + payrollTotals.netPay + commissionTotals.amount`. Subtitle lists the four contributors (driver flat/mileage payouts, reimbursements, asset upkeep). Icon: `TrendingDown` in `text-destructive`.
- **Net Operating Income / Margin** = `grossRevenue − combinedCosts`; show margin % beside the dollar figure with green/red coloring. Icon: `PiggyBank`.

Each card uses semantic tokens (`text-success`, `text-destructive`, `bg-card`) — no hardcoded colors.

### 2. CPM calculator with timeframe toggle
- ShadCN `ToggleGroup` (single-select) with `week | month | quarter`. Default `week`.
- Hook `usePLTrend(orgId)` returns:
  ```
  { week: PeriodRollup, month: PeriodRollup, quarter: PeriodRollup, weekly: WeekPoint[] }
  PeriodRollup = { revenue, costs, miles }
  WeekPoint = { weekStart: 'YYYY-MM-DD', label: 'W## MMM dd', revenue, costs, net }
  ```
  - `week` = trailing 7 days, `month` = trailing 30 days, `quarter` = trailing 90 days from today, in user's local TZ (use existing `date-fns` `subDays`/`startOfWeek` helpers, with `T00:00:00` guard from the date memory).
  - Fetches in parallel from `fleet_loads` (delivered, `delivery_date >= today-84d`, sums `booked_rate`/`actual_miles`), `expenses` (org-scoped, `expense_date` window), `driver_payroll` (`pay_period_end` window), `agent_commissions` (revenue side). All filtered by `org_id = current org`.
  - Org id pulled via the existing `useAuth` / `useOrgContext` pattern already used elsewhere in `src/hooks/` (will mirror whichever `useOperationalCPM` already uses).
- Three readouts per selected timeframe:
  - **RPM** = `revenue / miles`
  - **EPM** = `costs / miles`
  - **NPM** = `(revenue − costs) / miles`
  - Show `—` when `miles === 0`; tabular-nums; `text-success` for positive NPM, `text-destructive` for negative.

### 3. 12-week trend chart
- Recharts `ComposedChart` (already in dependencies). Two stacked datasets:
  - Filled area for **Gross Revenue** in `hsl(var(--success))` at 30% opacity with a solid 2px line on top.
  - Filled area for **Combined Costs** in `hsl(var(--destructive))` at 25% opacity with a solid 2px line on top.
  - Optional thin dashed line for **Net** in `hsl(var(--primary))`.
- X axis: ISO week labels from `weekly[]` (oldest → newest). Y axis: currency, abbreviated (`$12k`).
- Uses the existing `ChartContainer` from `src/components/ui/chart.tsx` so tooltips, legend, and accessibility match the rest of the app.
- Height ~320px, `Suspense`-friendly skeleton (`ChartSkeleton`) while `usePLTrend` is loading.

## Out of scope
- Cross-tab data changes in `Finance.tsx`.
- Real-time subscriptions — TanStack defaults (`5m staleTime`, `refetchOnWindowFocus:false` per project memory) are sufficient.
- New schema, RLS, or seed data.
- Exporting / printing the new section.

## Verification
- `tsgo` typecheck.
- Visit `/finance` → Overview tab via Playwright; screenshot full page to confirm KPI strip + CPM toggle + chart render with no overflow and that legacy tables still appear below.
- Toggle CPM between Week / Month / Quarter and confirm the three numbers update.
