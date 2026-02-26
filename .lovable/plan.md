

## Analysis: Net Revenue Already Uses Per-Load Values

After reviewing the code, the Finance page **already sums `net_revenue` directly from each load record** (line 365 of Finance.tsx):

```typescript
netRevenue: acc.netRevenue + (load.net_revenue || 0),
truckRevenue: acc.truckRevenue + (load.truck_revenue || 0),
```

It does NOT recalculate from gross. The values you see ($21,878.10) are the sum of each load's stored `net_revenue` field.

### Why the numbers may still look wrong

The revenue calculation formula was just fixed (applying 65% to linehaul only, not gross). However, **existing loads in the database still have `net_revenue` and `truck_revenue` values computed with the old formula** (65% of entire gross including FSC and accessorials). These stale values persist until each load is re-saved.

### Proposed Fix

**Bulk recalculate all existing loads** by triggering the corrected `calculateRevenue` logic on every load in the database. This can be done two ways:

1. **Quick approach**: Add a "Recalculate All Loads" button on the Finance Settings tab that iterates through all loads and re-saves them with the corrected formula.

2. **Automatic approach**: Run a one-time database function or edge function that recalculates `truck_revenue`, `trailer_revenue`, `net_revenue`, and `settlement` for all existing loads using the corrected formula (65% of linehaul only + 100% FSC + 100% accessorials).

### Recommended: Option 1 — Recalculate Button

| File | Action |
|------|--------|
| `src/pages/FleetLoads.tsx` | Export `calculateRevenue` as a reusable utility (or extract to a shared lib) |
| `src/pages/Finance.tsx` | Add a "Recalculate Revenue" button in the Settings tab that fetches all loads, runs the corrected formula, and batch-updates the stored values |

This ensures every load's stored `net_revenue` reflects the corrected calculation, and the Finance page totals will then be accurate.

