## Findings from the recorded data

The current Fleet Runway card is wrong because it only counts a small whitelist of “recurring overhead” expense types, divides those by 3 months, and ignores most recorded costs such as Fuel, Misc, Tolls, DEF, Card Fee, Trip Scanning, PrePass/Scale, Direct Deposit Fee, and credits/discounts. It also uses gross dispatch revenue for month-to-date revenue instead of the truck’s 1099/net revenue.

Based on the current database records:

- **One active truck MTD:** 1 truck
- **MTD 1099/truck revenue:** `$10,168.67`
- **MTD gross dispatch revenue:** `$14,673.80` — this is what the card is incorrectly showing
- **MTD recorded P&L expenses:** `$1,193.68`
- **MTD net after recorded expenses:** `$8,974.99`
- **MTD dispatch days:** `5`
- **MTD expense per dispatch day:** `$238.74`
- **Trailing 30-day recorded P&L expenses:** `$6,934.75`
- **Trailing 30-day cost per calendar day:** `$231.16`
- **Trailing 90-day recorded P&L expenses:** `$20,650.38`
- **Trailing 90-day cost per calendar day:** `$229.45`

So the displayed `$13.76/day` and `21,330%` are invalid outputs from an incomplete expense basis and gross revenue numerator.

## Implementation plan

1. **Fix the runway data model in `usePLTrend`**
   - Replace the recurring-overhead-only calculation with **all recorded P&L expenses**.
   - Exclude only non-P&L advances: `Advance`, `Cash Advance`, `Card Load`, `Direct Deposit`, and rows marked `Advance (Non-P&L)`.
   - Keep credits/discounts such as `Fuel Discount` and `Reimbursement` in the total so they reduce expenses instead of disappearing.
   - Include every real expense type in the breakdown: Fuel, Misc, Tolls, DEF, Card Fee, Trip Scanning, insurance/warranty/benefits, etc.

2. **Use truck 1099 revenue for MTD runway revenue**
   - Change the MTD revenue numerator from `gross_revenue` to the truck’s actual earning value: prefer `net_revenue`, then `truck_revenue`, then fallback to `gross_revenue` only if no net/truck revenue exists.
   - This aligns with the earlier rule that 1099 revenue is what the truck makes after the 65% cut.

3. **Correct cost-per-day logic**
   - Stop dividing a partial recurring subset by dispatch days.
   - Compute cost/day from recorded P&L expenses over a clear period:
     - primary display: trailing 30-day recorded expense run-rate ÷ 30 calendar days
     - MTD break-even: MTD recorded P&L expenses
   - This should produce about `$231.16/day` using current trailing 30-day expenses, not `$13.76/day`.

4. **Update the Fleet Runway UI labels**
   - Rename “Fleet Cost Per Day” to clarify it is based on recorded P&L expenses.
   - Show a full expense breakdown instead of only fixed overhead.
   - Show MTD 1099 revenue, MTD recorded expenses, and net after expenses.
   - Replace the misleading huge break-even gauge with a bounded, understandable MTD revenue-vs-expense indicator.

5. **Verify against the current records**
   - Confirm the card no longer shows `$13.76` or `21,330%`.
   - Confirm MTD revenue shows approximately `$10,168.67`.
   - Confirm MTD recorded expenses show approximately `$1,193.68`.
   - Confirm trailing 30-day cost/day shows approximately `$231.16`.