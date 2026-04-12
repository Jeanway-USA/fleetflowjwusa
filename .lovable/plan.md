

## Fix Escrow Payment and Non-Canonical Expense Type Inconsistencies

### Problem
The Landstar statement parser creates expenses with `expense_type: 'Escrow Payment'`, which is not in the canonical `EXPENSE_TYPES` list. There are currently 20+ "Escrow Payment" records in the database. Because this type isn't in the canonical list:

- The Finance page's "Select by type" dropdown doesn't list it, so you can't filter/select these expenses for bulk deletion
- The type dropdown when creating/editing expenses doesn't include it
- These records still appear in the table but are effectively unmanageable

Meanwhile, the Loads page `ExpensesList` shows all expenses for a load regardless of type, so "Escrow Payment" entries appear there.

### Root Cause
The Landstar parser (`parse-landstar-xlsx.ts`) has `TRIP% ESCROW` in `REVENUE_IGNORE_PATTERNS` (line 31) to skip escrow as revenue, but the escrow line still gets parsed as an expense. The `EXPENSE_TYPE_MAP` has no mapping for escrow, so `mapExpenseType()` falls through and returns the raw description as the type — creating "Escrow Payment" instead of a canonical type.

### Fix (3 changes)

**1. `src/lib/parse-landstar-xlsx.ts`** — Map escrow to a canonical type
- Add `[/\bESCROW\b/i, 'Misc']` to `EXPENSE_TYPE_MAP` so future Landstar imports create escrow expenses as "Misc" (with the original description preserved in the `description` field)
- Alternatively, since escrow is a form of advance/deduction, map it to `'Advance'` if that better matches the business meaning. Given that escrow is money held back (like a deduction), "Misc" is safest.

**2. `src/pages/Finance.tsx`** — Show ALL expense types in the "Select by type" dropdown
- Change the type dropdown filter (line 705) from `EXPENSE_TYPES.filter(...)` to dynamically derive the list from actual data: get unique `expense_type` values from `sortedFilteredExpenses`. This ensures any non-canonical types in the database are visible and selectable for bulk operations.
- Apply the same fix on lines 827, 854, 1004, 1087 if they also reference `EXPENSE_TYPES` for filtering.

**3. Consider a one-time data cleanup** — Reclassify existing "Escrow Payment" records
- Either via the Finance page (once fix #2 makes them selectable) the user can bulk-edit them to "Misc" or delete them
- Or add a migration to update existing records: `UPDATE expenses SET expense_type = 'Misc' WHERE expense_type = 'Escrow Payment'`

### Files to modify
- `src/lib/parse-landstar-xlsx.ts` — Add escrow mapping
- `src/pages/Finance.tsx` — Derive type filter dropdown from actual data instead of hardcoded list

