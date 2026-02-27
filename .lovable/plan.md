

## Replace Gap Analysis Cards with Revenue Breakdown

### Problem
The middle section of the 1099 Audit Mode currently shows gap analysis cards (Missing Net Revenue, Non-Delivered, Card/Cash Advances, Total Loads). The user wants this replaced with a revenue component breakdown: Linehaul Revenue (after 65%), Fuel Surcharge, Accessorials, and Total Loads.

### Changes

**File: `src/components/finance/AuditReconciliation.tsx`**

1. **Add computed totals** for the three revenue components from `ytdLoads`:
   - `totalTruckRevenue` = sum of `l.truck_revenue` (this is the linehaul after the 65% split)
   - `totalFSC` = sum of `l.fuel_surcharge`
   - `totalAccessorials` = sum of `l.accessorials`

2. **Replace the gap analysis grid** (lines 155-173) with four new cards:
   - **Linehaul Revenue (65%)** — shows `totalTruckRevenue`
   - **Fuel Surcharge** — shows `totalFSC`
   - **Accessorials** — shows `totalAccessorials`
   - **Total Loads (YTD)** — shows `ytdLoads.length` (stays the same)

3. **Clean up unused variables**: Remove `loadsWithoutNetRevenue`, `nonDeliveredLoads`, `cardAdvanceExpenses`, `totalCardAdvances`, and the `ytdExpenses` memo (no longer needed). Also remove the `Expense` type import and `expenses` prop if no longer used elsewhere in the component. The reconciliation formula section can also drop the Card Advances line.

