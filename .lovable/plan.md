## What's wrong

Generating the Jul 10–16 settlement for Timothy Ames fails with:
`duplicate key value violates unique constraint "uq_driver_settlements_org_driver_period_end"`

Verified in the database:
- The only row for period_end 2026-07-16 is Timothy Ames' settlement, and it is **soft-deleted** (`deleted_at = 2026-07-29 20:49`).
- The uniqueness rule `uq_driver_settlements_org_driver_period_end (org_id, driver_id, period_end)` has no `deleted_at` condition, so archived settlements still block a new one for the same driver and period.
- `generate_driver_settlements` does a plain `INSERT` with no conflict handling, so any collision surfaces as a raw Postgres error instead of a useful message.

## Fix

**1. Make the uniqueness rule ignore archived rows**

Replace the index with a partial one:
```sql
DROP INDEX IF EXISTS public.uq_driver_settlements_org_driver_period_end;
CREATE UNIQUE INDEX uq_driver_settlements_org_driver_period_end
  ON public.driver_settlements (org_id, driver_id, period_end)
  WHERE deleted_at IS NULL;
```
Archived settlements no longer block regeneration; live ones still can't duplicate.

**2. Handle a live existing settlement gracefully in `generate_driver_settlements`**

Before inserting, look for a non-deleted settlement for the same (org, driver, period_end):
- If it exists and is `draft` — delete its line items and the row, then generate fresh (regeneration is the expected behavior for a draft).
- If it exists and is `approved` or `paid` — skip that driver instead of erroring, so a bulk run for several drivers doesn't fail wholesale.

**3. Report skips in the UI**

`GenerateSettlementsDialog` currently reports only the rows returned. Add a note when fewer settlements come back than drivers selected, e.g. "Generated 2 settlements. 1 driver skipped (already has an approved/paid settlement for this period)."

## Technical notes

- Files: new migration for the index + function; `src/components/finance/driver-settlements/GenerateSettlementsDialog.tsx` for the messaging.
- The function keeps `SECURITY DEFINER` and the existing owner/payroll_admin authorization check.
- No change to pay math, net pay generation, or YTD logic.
