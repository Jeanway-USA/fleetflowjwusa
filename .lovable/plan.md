## Overhaul `generate_driver_settlements` pay logic

Rewrite the RPC so each driver's gross pay follows their `pay_type`, and stop skipping drivers whose only work in the period is still in transit.

### Per-pay-type rules

- **flat**: look for any `fleet_loads` assigned to the driver in the period where `status IN ('in_transit','delivered')` (pickup_date OR delivery_date inside the window). If at least one exists → gross = driver `pay_rate` (flat fee). Accessorials are not added.
- **per_mile / cpm**: only `status = 'delivered'` loads with `delivery_date` in window. Gross = SUM(`booked_miles`) × `pay_rate`. (Uses "loaded miles" = `booked_miles`, our canonical loaded-miles field; falls back to `actual_miles` only if booked is null.)
- **percentage**: only `status = 'delivered'` loads with `delivery_date` in window. Gross = SUM(`rate` × 0.65 [truck_percentage setting] × `pay_rate`/100). FSC and accessorials excluded, matching `calculateLoadPay`.

Reimbursements stay manual (0 at generation, recomputed by `recalc_settlement_totals` when line items are added). Net pay stays generated column `gross + reimbursements`. YTD recompute unchanged.

### Fix the "no work done" skip

Today the RPC does `IF _gross = 0 THEN CONTINUE`, so flat-rate drivers mid-trip get dropped. New behavior:

- For **flat** drivers: if any qualifying in-transit/delivered load exists in the window, create the settlement with the full flat `pay_rate` even though no load is delivered yet.
- For **cpm / percentage**: keep skipping when there are zero delivered loads in the window (nothing to pay yet), but surface this as an informational return (the driver simply isn't returned in the result set, same as today).
- A driver passed explicitly in `_driver_ids` with no qualifying work for their pay type still won't generate a row — but flat drivers with active loads now will, removing the blocker the user described.

### Settlement line items

Rebuild the per-load items insert to match the new rules:

- flat → one line item `'Flat weekly pay'` for the full `pay_rate`, plus one informational line per in-transit/delivered load (`item_type = 'load_pay'`, amount `0`) so the PDF still lists the loads worked.
- per_mile → one `load_pay` line per delivered load: `miles × rate`.
- percentage → one `load_pay` line per delivered load: `rate × 0.65 × pct`.

### Files touched

- `supabase/migrations/<new>.sql` — `CREATE OR REPLACE FUNCTION public.generate_driver_settlements(...)` with the new logic. Signature unchanged: `(_driver_ids uuid[], _period_end date, _payment_date date)`. `recalc_settlement_totals` untouched.

No frontend or PDF changes required — the table/PDF already render `gross_pay`, `reimbursements`, `net_pay`, and the load line items as-is.

### Open question

For **flat** drivers, should the in-transit detection use `pickup_date <= _period_end` (load picked up in or before the period and still moving), or strictly require pickup_date inside `[_period_start, _period_end]`? Defaulting to "pickup_date <= period_end AND (delivery_date IS NULL OR delivery_date >= _period_start)" so a load that straddles a period still counts — confirm if you want stricter.
