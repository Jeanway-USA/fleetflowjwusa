

## Fix Expense Type Mismatch Between Loads and Finance Pages

### Problem
The `ExpensesList` component (used on the Loads page) and the Finance page's Expenses tab use **different expense type lists**. They both read/write to the same `expenses` table, but:

1. **Missing types in ExpensesList**: The Loads component has 16 types while Finance has 26. Types like `Fuel Discount`, `Reimbursement`, `Registration/Plates`, `Cash Advance`, `Card Fee`, `Direct Deposit Fee`, `Advance`, `Direct Deposit`, `Truck Warranty`, `CPP/Benefits` are missing from Loads.
2. **Naming mismatch**: Loads uses `'LCN'` but Finance uses `'LCN/Satellite'`. Expenses created on one page with `'LCN/Satellite'` won't match the type dropdown on the other.
3. **Expenses with unrecognized types are invisible**: If an expense was created on Finance with a type not in the Loads list, it still appears in the table but can't be created or edited from Loads.

### Fix

**File: `src/components/shared/ExpensesList.tsx`**

- Replace the local `EXPENSE_TYPES` array with the **same canonical list** used in `Finance.tsx`
- Fix `'LCN'` → `'LCN/Satellite'` to match the Finance naming
- Add all missing types: `Fuel Discount`, `Reimbursement`, `Registration/Plates`, `Cash Advance`, `Card Fee`, `Direct Deposit Fee`, `Advance`, `Direct Deposit`, `Truck Warranty`, `CPP/Benefits`
- Extract the canonical expense types list into a shared constant in a new file `src/lib/expense-types.ts` so both files import from the same source of truth
- Update `Finance.tsx` to import from the same shared constant

**File: `src/lib/expense-types.ts`** (New)

- Export `EXPENSE_TYPES` (the full canonical list)
- Export `GALLONS_EXPENSE_TYPES` (`['Fuel', 'DEF']`)
- Export `ADVANCE_EXPENSE_TYPES`, `CREDIT_EXPENSE_TYPES`, and the helper functions `isAdvanceExpense`, `isCreditExpense`, `isActualExpense` so they're shared too

### Result
Both pages will show the exact same expense types, use the same naming, and any expense created on either page will appear correctly on the other.

