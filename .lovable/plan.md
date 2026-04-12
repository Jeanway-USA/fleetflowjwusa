

## Fix Profitability Tab Data Inconsistencies

### Problem
The Profitability tab uses a fundamentally different cost model than the P&L and other Finance tabs, producing conflicting numbers:

1. **Double-counting overhead**: It applies `costPerMile * miles` as "overhead" per load, but the P&L tab already counts actual expenses (fuel, insurance, truck payment, etc.) from the `expenses` table. The CPM overhead is meant to be a benchmark, not layered on top of actual costs.

2. **Wrong gross revenue source for Independent mode**: Uses `load.gross_revenue` which may reflect Landstar splits rather than the true gross (rate + FSC + accessorials).

3. **Driver pay estimation is wrong for Independent O/O**: The tab estimates driver pay from the `drivers` table pay rate. An Independent owner-operator IS the driver — there's no separate driver pay. This inflates costs.

4. **Fuel/tolls from `load_expenses` (Landstar settlement data)** vs actual `expenses` table: The `load_expenses` table is Landstar-specific settlement line items. For Independent mode, fuel and tolls come from the `expenses` table. The profitability tab only checks `load_expenses`, missing real expense data.

5. **`loadExpenses` prop is unfiltered by period**: `deliveredLoads` is period-filtered, but the raw `loadExpenses` array is passed without filtering, potentially pulling data from other periods.

6. **Break-even RPM and Actual CPM use `totalExpenses + totalPayroll`** from Finance.tsx (correct), but True Net Income per load uses the separate CPM model — so the KPI cards contradict each other.

### Solution
Align the Profitability tab with the same data the P&L uses:

**File: `src/components/finance/LoadProfitabilityTab.tsx`**

- **Add `isIndependent` prop** (passed from Finance.tsx)
- **Remove CPM overhead from per-load calculation** — overhead is already captured in actual expenses
- **Independent mode**: Skip driver pay entirely (owner keeps 100%). Per-load cost = actual load-linked expenses from the `expenses` table (fuel, tolls, etc.)
- **Landstar mode**: Keep driver pay estimation but use load-linked expenses from `expenses` table instead of `load_expenses` for fuel/tolls
- **Add new prop `loadLinkedExpenses`**: Pass the period-filtered, load-linked expenses from the `expenses` table so per-load costs match the P&L
- **Fix True Net calculation**: True Net = Gross Revenue - (load-linked expenses + driver pay if Landstar). Overhead allocation for non-load-linked expenses shown separately as a note, not double-counted
- **Fix KPI cards**: Break-even RPM and Actual CPM should use the same `totalExpenses + totalPayroll` already passed in, ensuring consistency with P&L

**File: `src/pages/Finance.tsx`**

- Pass `isIndependent` to `LoadProfitabilityTab`
- Pass `filteredExpenses` (already passed as `expenses`) — the component will filter to load-linked ones internally, OR pass the pre-computed `loadLinkedExpenses` subset
- Remove the unused `loadExpenses` prop if no longer needed (or keep for backward compat)

### Technical details
- The `expenses` table has a `load_id` field that links expenses to specific loads — this is the correct source for per-load costs
- `load_expenses` is a Landstar-specific settlement breakdown table — not relevant for Independent mode
- The per-load table will show: Gross Revenue, Direct Costs (load-linked expenses), and for Landstar mode also Driver Pay, yielding a True Net that sums to match the P&L totals
- KPI formulas become consistent: Break-even RPM = (totalExpenses + totalPayroll) / totalMiles (same as P&L), Actual RPM = netRevenue / totalMiles

