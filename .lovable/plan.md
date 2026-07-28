## Plan

1. **Update the payout generator database function**
   - Create a backend migration that replaces the current `generate_safety_bonus_payouts(date)` function.
   - Keep the existing payout logic intact.
   - Change the upsert conflict clause from a column-based target to the named unique constraint so the function’s return field `driver_id` no longer conflicts with the table column.

2. **Preserve existing safety behavior**
   - Keep the owner/payroll authorization check.
   - Keep tenant scoping through the user’s organization.
   - Keep the rule that existing `approved` or `paid` payouts are not reset back to pending/void when regenerating.

3. **Verify the fix**
   - Run the same payout generation path for the selected month.
   - Confirm the ambiguous `driver_id` error is gone.
   - Confirm rows are created or updated in `safety_bonus_payouts` for the month.

## Technical detail

The error is coming from the database function’s `RETURNS TABLE(driver_id ...)` output column. Inside PL/pgSQL, that output column is also a variable, so `ON CONFLICT (driver_id, period_start)` can be interpreted ambiguously. The fix is to use:

```sql
ON CONFLICT ON CONSTRAINT safety_bonus_payouts_driver_id_period_start_key
```

instead of referencing `driver_id` directly in the conflict target.