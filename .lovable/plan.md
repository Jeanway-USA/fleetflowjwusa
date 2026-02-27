## Fix Linehaul Revenue Card to Show Booked Linehaul

The "Linehaul Revenue (65%)" card currently sums `truck_revenue` (rate after 65% split). The user wants it to show the raw **Booked Linehaul (rate after 65% split)** — the sum of `rate` from each load.

### Changes

**File: `src/components/finance/AuditReconciliation.tsx**`

1. Rename `totalTruckRevenue` to `totalLinehaul` and change from summing `l.truck_revenue` to summing `l.rate`.
2. Update the card label from "Linehaul Revenue (65%)" to "Booked Linehaul".