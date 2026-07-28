## Problem

The Multi-State Overview only shows FL because its query uses an inner join on the payroll ledger — drivers without any finalized payroll run are dropped entirely, so their states never appear. States with no tax obligation or no payroll activity are invisible.

## Fix

In `src/pages/admin/TaxHub.tsx` (Multi-State tab):

- Change the drivers query from an inner join to a left join on `internal_payroll_ledger`, so every active (non-terminated) driver is returned whether or not payroll exists.
- Build the state rows from all active drivers' `tax_state` values; states with no finalized payroll simply show $0.00 for YTD wages, SUTA, and SIT while still showing the employee count, SUTA rate, SIT status, registration badge, and Configure action.
- Keep the existing aggregation rules: only finalized ledger rows for the selected year contribute to dollar amounts.
- Update the card description to say it lists every state where you have workers assigned, regardless of tax obligation.

## Technical detail

Replace `internal_payroll_ledger!inner(...)` with the plain embedded relation `internal_payroll_ledger(...)`. The existing `asArray()` normalization and dedupe-by-driver employee count logic already handle drivers with zero ledger rows, so the memo needs no structural change beyond initializing a state record for every driver with a `tax_state`. No database or schema changes needed.
