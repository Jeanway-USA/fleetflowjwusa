## Problem

Generating a settlement for Timothy Ames (flat-rate, active) returns **"No drivers had activity in this period."** even though he has 4 current loads tied to him.

Root cause from the DB: all 4 of his loads have `status = 'assigned'` (one is `in_transit`, but its `delivery_date` 2026‑06‑25 is fine — actually one *is* in_transit and should match, but the others are `assigned`). The `generate_driver_settlements` SQL function only treats `delivered` and `in_transit` as activity for flat-rate drivers, so `assigned` / dispatched loads are invisible to payroll. If the user picks a period end before the in_transit load's pickup window, Timothy gets skipped entirely and (when he's the only selected driver) the toast fires.

The original spec for flat-rate was: *"any load assignment within the pay period dates, whether its status is in transit or [delivered]"* — i.e. **any assigned work in the window counts**, since flat drivers are paid a fixed weekly rate regardless of completion.

## Fix

Update the `generate_driver_settlements` SQL function so the flat-rate activity check counts **any non-cancelled load assignment** that overlaps the period window, not just delivered/in_transit. Concretely, replace the status filter for the flat branch with:

```sql
AND l.status NOT IN ('cancelled','canceled','voided','draft')
```

(and apply the same broadened filter to the "first activity" lookup that derives `_period_start` when no prior settlement exists, so flat drivers' very first period also starts from their earliest assigned load).

CPM and percentage branches stay on `status = 'delivered'` — those pay types only earn when the load actually completes, per spec.

No UI, RLS, or schema changes. One new migration that `CREATE OR REPLACE`s the function with the broadened flat-rate status filter; everything else in the function is preserved.

## Verification

After the migration:
- Re-run the generator for Timothy with period end 2026‑06‑26 → should produce a $1,700 flat-rate settlement (his 4 assigned/in_transit loads count as activity).
- Siadrak (percentage) and Andrew (CPM) behavior unchanged — they still require `delivered` loads.
