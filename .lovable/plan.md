## Plan

1. **Correct the parser instructions for 1099 revenue**
   - Update the document parsing function so `1099 REVENUE` is treated as the truck’s already-split revenue, not a gross linehaul amount.
   - Tell the parser to prefer the actual `1099 REVENUE` row for reconciliation when present.
   - Keep `TRACTOR L/H`, `LINE HAUL`, and similar gross/detail rows from being used as the final truck revenue when a 1099 revenue amount exists for the same trip.

2. **Normalize revenue rows before reconciliation**
   - Add a small revenue normalization step in `settlement-reconciliation.ts` that groups rows by trip number.
   - For each trip, select the best statement amount in this order:
     1. `1099 REVENUE` amount
     2. explicit truck/net revenue amount
     3. fallback flat-rate amount
   - Prevent duplicate revenue rows for the same trip from being summed when they represent the same earning in different statement sections.

3. **Fix period-total double counting**
   - Update the period total calculation so it only sums the normalized per-trip statement revenue once.
   - Ensure unmatched revenue is not added twice when a row has no trip number.

4. **Make the mismatch display clearer**
   - Keep showing expected truck revenue as `65% of gross dispatch rate`.
   - Label the statement amount as `1099 revenue` so it’s clear the app is comparing truck share to truck share.

5. **Verification**
   - Add or run a focused reconciliation check using the shown case: gross dispatch rate `$2,500`, truck split `65%`, statement 1099 revenue `$1,625`.
   - Confirm this produces no blocking discrepancy and no period mismatch for that matched trip.