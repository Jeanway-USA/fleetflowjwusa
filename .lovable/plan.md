

## Fix Financial Logic: Advances, Income Filtering, and UI Restructuring

### Problem
1. Card advances (Cash Advance, Card Pre-Trip, CARD CONT. SPEC ADV) double-count against fuel expenses
2. General income (TRACTOR L/H, Line Haul) is being parsed when it should be ignored
3. UI mixes all items together instead of separating advances from true expenses

### Changes

**1. `src/lib/parse-landstar-xlsx.ts` — Add advance detection + ignore revenue**
- Add `is_advance` field to `ExtractedExpense` interface
- Add revenue-ignore patterns: `/TRACTOR\s*L\/H/i`, `/LINE\s*HAUL/i`, `/1099\s*REVENUE/i` — skip these rows entirely
- Mark items matching `/ADVANCE/i`, `/CARD PRE-TRIP/i`, `/CARD CONT.*SPEC ADV/i` with `is_advance: true`
- Mark NATS Discount items with `is_discount: true`

**2. `src/lib/settlement-reconciliation.ts` — Update interfaces + reconciliation logic**
- Add `is_advance: boolean` to `ExtractedExpense` and `ReconciledExpense`
- Update `ReconciliationResult`: remove `earnings` array, add `advances: ReconciledExpense[]` and `credits: ReconciledExpense[]`
- In `reconcileDocuments`: stop creating earnings from contractor PDF revenue rows — skip them entirely (TRACTOR L/H, Line Haul, etc.)
- After dedup, split expenses into 3 buckets: `expenses` (normal), `advances` (is_advance), `credits` (is_reimbursement or is_discount)

**3. `src/components/finance/ReconciliationPreview.tsx` — Restructure UI**
- Remove Earnings tab entirely
- Replace with 3 tabs: "Actual Expenses", "Advances (Non-P&L)", "Credits & Reimbursements"
- Each tab shows its respective bucket with checkboxes, date editing, load matching
- Update summary footer:
  - `Total Expenses: $X`
  - `Total Credits/Discounts: $Y`
  - `Net Expense Impact: $(X - Y)`
  - `Advances Taken: $Z` (neutral, not in net calc)
- Update import logic: save advances with `expense_type: 'Advance'` and `notes: 'Advance (Non-P&L)'`, save credits as negative amounts

**4. `src/components/finance/StatementUpload.tsx` — Remove earnings references**
- Remove any references to `result.earnings` in the summary text after processing

### Files Modified
- `src/lib/parse-landstar-xlsx.ts`
- `src/lib/settlement-reconciliation.ts`
- `src/components/finance/ReconciliationPreview.tsx`
- `src/components/finance/StatementUpload.tsx`

