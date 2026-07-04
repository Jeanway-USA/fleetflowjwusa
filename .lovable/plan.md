## Add Tax State to the Driver Profile Card

### Goal
Expose and edit each driver's tax state directly on the Driver Profile Card (`DriverDetailSheet`) so W-2 payroll picks up the correct per-state SUTA/SIT rates.

### Changes

1. **`src/components/drivers/DriverDetailSheet.tsx`**
   - Show a **Tax State** row near the employment badges (visible for all employment types, since 1099 state reporting matters too, but styled subtly).
   - Render an inline **Select** (all 50 states + DC from `src/lib/us-states.ts`) so owner/payroll_admin can change it without opening the full edit dialog. Fall back to org `default_tax_state` label when unset.
   - On change, `UPDATE drivers SET tax_state = ... WHERE id = driver.id`, invalidate the `drivers` query, toast success/failure.
   - Disable the selector when `readOnly` is true or the current user lacks payroll access (reuse existing `useAuth`/role check pattern already imported).
   - Add a tiny helper caption: "Used for SUTA and state income tax withholding."

2. **W-2 payroll integration** — no code change required. Verified during exploration:
   - `supabase/functions/run-w2-payroll/index.ts` already resolves `driver.tax_state → org default → 'FL'` and looks up `state_tax_configurations` for SUTA rate/base, wage base, and SIT.
   - `RunW2PayrollDialog` and `W2PayrollHistoryCard` already display the resolved state badge and SIT column.

### Out of scope
- Schema changes (`tax_state` column already exists on `drivers`).
- Bulk-assign tax state across drivers.
- Per-driver SIT override (still uses the state config row).

### Technical notes
- Use existing `supabase` client and `useQueryClient().invalidateQueries({ queryKey: ['drivers'] })` pattern already used elsewhere in the sheet.
- Reuse the `US_STATES` list from `src/lib/us-states.ts` (same source as `PayrollTaxesCard` and the Drivers edit form) to keep state codes consistent.
