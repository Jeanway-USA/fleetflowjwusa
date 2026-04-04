

## Skip "TRIP% ESCROW PAYMENT" During Expense Import

"TRIP% ESCROW PAYMENT" is an internal escrow withholding that doesn't affect net pay. It should be filtered out during import, similar to how revenue lines are already skipped.

### Changes

**1. `src/lib/parse-landstar-xlsx.ts`**
- Add `/\bTRIP%?\s*ESCROW/i` to `REVENUE_IGNORE_PATTERNS` so these lines are skipped entirely during XLSX parsing.
- Remove the corresponding entry from `EXPENSE_TYPE_MAP` since it will never reach mapping.

**2. `supabase/functions/parse-landstar-statement/index.ts`**
- Update the AI prompt to instruct the model to **skip/ignore** "TRIP% ESCROW PAYMENT" lines instead of categorizing them as "Escrow Payment".

**3. `src/pages/Finance.tsx`**
- Remove `'Escrow Payment'` from the `EXPENSE_TYPES` filter array since it will no longer appear.

**4. `src/pages/ExecutiveDashboard.tsx`**
- Remove the `'Escrow Payment'` entry from the expense category mapping.

### Impact
Existing escrow records already in the database are unaffected. Future imports (both XLSX and AI-parsed PDFs) will simply skip these lines.

