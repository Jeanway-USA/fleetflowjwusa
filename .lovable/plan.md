

## Fix Expense Data Inconsistency Between Loads and Finance Profitability

### Problem
Two bugs cause the Profitability tab to show different expense data than the rest of the Finance page:

1. **Case mismatch in expense type matching**: The profitability component checks `exp.expense_type === 'fuel'` and `=== 'tolls'` (lowercase), but all expenses are stored with capitalized types (`'Fuel'`, `'Tolls'`). Result: fuel and tolls columns always show $0, and everything lands in "Other".

2. **Advance/credit expenses not excluded**: The Finance page separates expenses into "Actual", "Advance (non-P&L)", and "Credit" buckets. The Profitability tab ignores this and counts all load-linked expenses, inflating per-load costs with non-P&L items like Cash Advances or Fuel Discounts.

### Fix

**File: `src/components/finance/LoadProfitabilityTab.tsx`**

- Fix case: change `'fuel'` to `'Fuel'`, add `'DEF'` to the fuel bucket; change `'tolls'` to `'Tolls'`
- Add the same advance/credit exclusion logic used in Finance.tsx (filter out `Advance`, `Cash Advance`, `Card Load`, `Direct Deposit`, `Reimbursement`, `Fuel Discount`, and negative-amount items) before building the per-load expense map
- This ensures the per-load "Direct Costs" column matches what the P&L tab reports as actual operating expenses

### Result
The Profitability tab's per-load costs, True Net Income, and KPI cards will be consistent with the P&L Summary and Revenue tabs.

