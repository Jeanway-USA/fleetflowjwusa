## Problem

On `/fleet-loads`, the totals row (Loads, Rate, FSC, Accessorials, Gross Revenue, Net Revenue, Settlement, Miles) sums **every** load in the filtered list — including loads with `status = 'cancelled'`. Cancelled loads should not contribute to gross or net income.

Other revenue surfaces (Finance P&L, Executive Dashboard, Broker Rate History) already filter to `status = 'delivered'`, so they are unaffected.

## Change

In `src/pages/FleetLoads.tsx`, exclude cancelled loads from the totals reducer only. The table itself still displays cancelled loads (so users can see and manage them) — only the aggregated KPI row changes.

```ts
const totals = filteredLoads
  .filter((l: any) => l.status !== 'cancelled')
  .reduce((acc: any, load: any) => ({ ... }), { ... });
```

The `loads` count in totals will also drop cancelled rows so "Loads / Gross / Net" stay internally consistent.

No database, RLS, or other component changes needed.