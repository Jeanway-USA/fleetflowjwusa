

## Fix Booked Linehaul to Show Post-65% Split

The "Booked Linehaul" card should display the sum of `truck_revenue` (linehaul after the 65% truck split), not the raw `rate`.

### Change

**File: `src/components/finance/AuditReconciliation.tsx`**

1. Change `totalLinehaul` calculation from summing `l.rate` back to summing `l.truck_revenue` — this is the linehaul after the 65% split is applied.
2. Update card label to "Booked Linehaul (65%)" for clarity.

