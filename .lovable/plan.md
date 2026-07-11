## Problem

On the Landstar contractor statement, the "1099 Revenue" column already reflects the truck's post-split share (Rate Base × truck %). Example from the uploaded statement: Rate Base $2,500 × 65% = $1,625 (1099 Revenue).

Reconciliation currently compares that $1,625 statement value against the dispatch load's stored gross `rate` ($2,500), producing a false −$875 per-trip discrepancy and a false period-total mismatch. Users can never clear the "Settlement halted — flat-rate discrepancies detected" banner even when the statement is correct.

## Fix

Apply the org's Landstar truck split (from `usePaySettings` → `company_settings.truck_percentage`, default 0.65) to the dispatch expected amount before comparing to the parsed statement revenue. This keeps the dispatch load stored as gross and only normalizes at compare time.

### Changes

1. `src/lib/settlement-reconciliation.ts`
   - Add a `landstarSplit: number` parameter to `reconcileRevenue` (and thread it through `reconcileDocuments`).
   - When computing `expected` for a matched trip, use `expected = grossRate * landstarSplit` (rounded to cents) instead of raw `rate`. Preserve the gross value on the mismatch row as a new `expected_gross_amount` field so the UI can show both numbers.
   - Apply the same split to `expectedTotal` in the period-total fallback.

2. `src/components/finance/StatementUpload.tsx`
   - Read `landstarSplit` via `usePaySettings()` and pass it into `reconcileDocuments`.

3. `src/components/finance/ReconciliationPreview.tsx`
   - Update the "Expected (dispatch)" column and period-mismatch banner to display the split-adjusted expected value. Optionally show the gross in a muted subtext (e.g., `$1,625.00  (65% of $2,500.00)`) so users understand the math.
   - No change to tolerance thresholds (±$1/trip, ±$5/period) — they now apply to net figures, which matches the statement precision.

### Non-changes

- No change to how `fleet_loads.rate` is stored (still gross).
- No change to expense parsing, advances, or credits.
- No migration needed.

### Verification

- Load the current dataset (Unit #T433780, period 2026-07-01 → 2026-07-08, Trip 3625883, gross $2,500): expected should now compute to $1,625.00, matching the statement, and the halted-settlement banner should disappear.
- Verify `usePaySettings` returns a fraction (0.65) — the hook already normalizes `65` → `0.65`.
