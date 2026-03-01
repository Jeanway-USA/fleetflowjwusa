

## Update Finance Page Expenses Tab for New Settlement Categories

### Problem
The Expenses tab sums ALL records from the `expenses` table into one total, including Advances (which are non-P&L) and Credits (which offset expenses). The statement parser now correctly categorizes these, but the Finance page doesn't account for the distinction.

### Changes

**`src/pages/Finance.tsx`**

1. **Add 'Advance' to `expenseTypes` array** so it appears in dropdowns and breakdowns

2. **Update expense categorization constants** — define which types are advances vs credits:
   - Advances: `expense_type === 'Advance'` or `notes` contains 'Advance (Non-P&L)'
   - Credits: `expense_type` in `['Reimbursement', 'Fuel Discount']` or `amount < 0`

3. **Split `getFilteredExpenses` results into 3 groups**:
   - `actualExpenses` — true P&L expenses (exclude advances and credits)
   - `advanceExpenses` — advance-type records (display-only, not in totals)
   - `creditExpenses` — reimbursements/discounts (offset from expenses)

4. **Update `totalExpenses` calculation** (line ~439):
   - Only sum actual expenses (not advances)
   - Subtract credits to get net expense impact
   - Current: `totalExpenses = loadExpenseTotals.operatingTotal + standaloneExpenseTotals.total + loadLinkedExpenseTotals.total`
   - New: same but exclude advances from standalone/loadLinked totals, and subtract credits

5. **Update Summary Cards** (lines 530-562):
   - "Total Expenses" card shows net expense (actual expenses minus credits)
   - Add a small note showing advances separately

6. **Update Expense Table display** (lines 658-694):
   - Add visual indicators: Advance rows get amber badge, Credit rows get green styling
   - Show "Advance (Non-P&L)" badge next to advance-type rows

7. **Update Expense Breakdown Card** (lines 700-771):
   - Add a third section: "Advances (Non-P&L)" showing advance totals neutrally
   - Update "GRAND TOTAL EXPENSES" to show:
     - Actual Expenses: $X
     - Credits/Discounts: -$Y  
     - Net Expense Impact: $(X-Y)
     - Advances Taken: $Z (neutral, not in total)

### Files Modified
- `src/pages/Finance.tsx`

