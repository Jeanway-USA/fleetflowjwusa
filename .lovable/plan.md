

## Fix: Truck % Display Showing 6500% Instead of 65%

### Root Cause
The `company_settings` table stores `truck_percentage` as `65` (a whole number percentage), but the code assumes it's a decimal (`0.65`). When displaying, it multiplies by 100 again — producing `6500%`. The same issue affects the revenue calculation, where `truckPct` of `65` instead of `0.65` would produce wildly incorrect splits.

### Fix (in `src/pages/LoadOptimizer.tsx`)

**Line 43-45** — Normalize DB values to decimals when parsing:
```typescript
truckPct: (parseFloat(map['truck_percentage']) > 1 
  ? parseFloat(map['truck_percentage']) / 100 
  : parseFloat(map['truck_percentage'])) || DEFAULT_TRUCK_PCT,
```
Apply the same `> 1 ? val/100 : val` guard to `trailerPct` and `advancePct`.

This way:
- If DB stores `65` → normalized to `0.65` → displays as `65%` ✓
- If DB stores `0.65` → stays `0.65` → displays as `65%` ✓
- Calculation in `calculateRevenue()` receives the correct decimal ✓

### Single file change
| File | Change |
|------|--------|
| `src/pages/LoadOptimizer.tsx` | Normalize percentage values from `company_settings` on lines 43-45 |

