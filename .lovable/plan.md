

## Fix Booked Linehaul to Show Rate × 65% Only

### Problem
`truck_revenue` in the database equals `(rate × 0.65) + fuel_surcharge + accessorials` (per `revenue-calculator.ts`). The Booked Linehaul card is summing `truck_revenue`, which double-counts FSC and accessorials already shown in their own cards.

### Change

**File: `src/components/finance/AuditReconciliation.tsx`, line 54**

Change the `totalLinehaul` calculation from:
```typescript
ytdLoads.reduce((s, l) => s + (l.truck_revenue ?? 0), 0)
```
to:
```typescript
ytdLoads.reduce((s, l) => s + ((l.rate ?? 0) * 0.65), 0)
```

This computes linehaul as `rate × 65%` for each delivered load, which is just the tractor linehaul percentage without FSC or accessorials.

