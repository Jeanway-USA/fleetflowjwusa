

## Filter Revenue Calculations to Delivered Loads Only

### Problem
The Finance page summary cards (Net Revenue, Gross Revenue, Net Profit) and the P&L Summary include revenue from loads in all statuses -- including pending, assigned, in_transit, etc. Only loads with status `delivered` should contribute to revenue figures.

### Fix

**Edit `src/pages/Finance.tsx`:**

1. **Create a `deliveredLoads` subset** from `filteredLoads` that only includes loads where `status === 'delivered'`.

2. **Use `deliveredLoads` for `revenueTotals`** calculation (line 352) instead of `filteredLoads`. This ensures only delivered loads contribute to gross revenue, net revenue, truck revenue, settlement totals, and mile calculations.

3. **Update the load count display** in the summary card (line 518) -- the subtitle will naturally reflect only delivered loads since it reads from `revenueTotals.loadCount`.

4. **Keep `filteredLoads` for non-revenue uses** like load expense lookups (line 378), the Revenue tab's load table, and audit reconciliation -- those should still show all loads.

5. **Update deadhead miles calculation** (lines 342-350) to also use only delivered loads, since revenue-per-mile metrics should be consistent.

### Specific Changes

| Location | Change |
|----------|--------|
| Line ~311 (after `filteredLoads`) | Add `const deliveredLoads = filteredLoads.filter((l: any) => l.status === 'delivered');` |
| Line 342 (`sortedLoads`) | Change `filteredLoads` to `deliveredLoads` |
| Line 352 (`revenueTotals`) | Change `filteredLoads.reduce` to `deliveredLoads.reduce` |
| Lines 374-376 (mile calcs) | These derive from `revenueTotals` so they auto-correct |
| Line 420-422 (profit calcs) | These derive from `revenueTotals` so they auto-correct |

No database changes needed. The summary cards, P&L Summary tab, and all downstream calculations will automatically reflect only delivered load revenue.

