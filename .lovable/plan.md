

## True Net Income & Load Profitability Enhancement

### Analysis
The existing schema already contains all necessary cost data:
- `load_expenses` table has per-load breakdowns: `fuel_cost`, `truck_payment`, `tolls`, `operating_total`, etc.
- `fleet_loads` has `gross_revenue`, `net_revenue`, `actual_miles`, `booked_miles`
- `expenses` table has standalone expenses (fuel, insurance, etc.)
- `useOperationalCPM` hook already calculates cost-per-mile from `company_settings`
- `drivers` table has `pay_rate` and `pay_type` for driver pay estimation

No database migration needed — all fields exist. This is a pure UI/logic feature.

### What to Build

**1. New Component: `LoadProfitabilityTab.tsx`**
A new tab on the Finance page ("Profitability") containing:

- **Per-Load Profitability Table**: For each delivered load in the period, show:
  - Load ID, Origin → Destination, Miles
  - Gross Revenue
  - Driver Pay (estimated from `pay_rate` x gross or flat)
  - Fuel Cost (from `load_expenses.fuel_cost`)
  - Tolls (from `load_expenses.tolls`)
  - Overhead (CPM x miles, using `useOperationalCPM`)
  - **True Net Income** = Gross Revenue - (Driver Pay + Fuel + Tolls + Overhead)
  - Color-coded: green if profitable, red if not

- **Break-Even Indicator Card**: Shows the minimum rate-per-mile needed to cover costs. Calculated as: `(total expenses in period) / (total miles in period)`. Displayed as a prominent card with the current average RPM alongside it for comparison.

- **CPM Calculator Card**: Shows `total period expenses / total period miles` as actual CPM, alongside the configured operational CPM from settings. Highlights variance.

- **Net vs Gross Revenue Trends Chart**: Using the existing `RevenueTrendsChart` pattern (Shadcn `ChartContainer` + Recharts `AreaChart`), show monthly Gross Revenue, True Net Income, and Total Costs over the last 6 months.

**2. Update `Finance.tsx`**
- Add a "Profitability" tab trigger after "Revenue"
- Pass the necessary data (deliveredLoads, loadExpenses, drivers, expenses, trucks, CPM) to the new component
- Join `load_expenses` to loads by `load_id` for per-load cost lookup

**3. Update `PLSummaryTab.tsx`**
- Add a "True Net Income" row in the Net Profit Calculation section that factors in the operational CPM overhead
- Add the Break-Even RPM as a new stat tile in the 2x2 grid

### Files to Create/Update
| File | Action |
|------|--------|
| `src/components/finance/LoadProfitabilityTab.tsx` | New — per-load profitability table, break-even card, CPM calculator, trends chart |
| `src/pages/Finance.tsx` | Add "Profitability" tab, pass data to new component |
| `src/components/finance/PLSummaryTab.tsx` | Add True Net Income row and Break-Even RPM stat tile |

### Technical Details
- Driver pay estimation: `load.gross_revenue * (driver.pay_rate / 100)` for percentage-based, or `driver.pay_rate * load.actual_miles` for per-mile
- Break-even RPM: `(totalExpenses + totalPayroll) / totalActualMiles`
- Trends chart: aggregate loads by month for the last 6 months, computing gross, net, and true net per month
- All calculations are client-side from already-fetched queries (no new DB calls needed)
- Uses existing Shadcn chart components (`ChartContainer`, `AreaChart`) matching the `RevenueTrendsChart` pattern

