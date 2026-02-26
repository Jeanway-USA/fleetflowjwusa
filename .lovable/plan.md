

## Fix Revenue Calculation: Apply Truck % to Linehaul Only

### Problem
Currently in `calculateRevenue()` (FleetLoads.tsx line 276), the truck percentage (65%) is applied to the entire `grossRevenue` (rate + FSC + accessorials). This is incorrect.

The correct Landstar compensation structure is:
- **Linehaul (rate)**: Driver gets 65% (truck %)
- **Fuel Surcharge**: Driver gets 100%
- **Accessorials**: Driver gets the net amount (already calculated as `amount * percentage / 100`)
- **Trailer**: If owned, trailer % applies to linehaul only (not FSC/accessorials)

### Current (Wrong)
```
grossRevenue = rate + fuelSurcharge + accessorialsTotal
truckRevenue = grossRevenue * 0.65  // Wrong: applies 65% to FSC and accessorials too
trailerRevenue = grossRevenue * 0.07
```

### Corrected
```
grossRevenue = rate + fuelSurcharge + accessorialsTotal  // unchanged
truckRevenue = (rate * 0.65) + fuelSurcharge + accessorialsTotal
trailerRevenue = ownsTrailer ? (rate * 0.07) : 0
// Power-only: truckRevenue = (rate * 0.70) + fuelSurcharge + accessorialsTotal
```

### File Changes

| File | Change |
|------|--------|
| `src/pages/FleetLoads.tsx` | Update `calculateRevenue()` lines 276-277 to apply truck/trailer % to linehaul only, then add FSC and accessorials at 100% |

### Specific Edit (lines 275-278)

**Before:**
```typescript
// Power-only loads use 70% truck revenue and no trailer revenue
let truckRevenue = isPowerOnly ? grossRevenue * 0.70 : grossRevenue * truckPct;
let trailerRevenue = isPowerOnly ? 0 : (ownsTrailer ? grossRevenue * trailerPct : 0);
```

**After:**
```typescript
// Truck % applies to linehaul only; FSC is 100% to driver; accessorials are already net
let truckRevenue = isPowerOnly
  ? (rate * 0.70) + fuelSurcharge + accessorialsTotal
  : (rate * truckPct) + fuelSurcharge + accessorialsTotal;
let trailerRevenue = isPowerOnly ? 0 : (ownsTrailer ? rate * trailerPct : 0);
```

This ensures existing loads will recalculate correctly when saved, and the Revenue Preview in the load form will immediately reflect the corrected math. All downstream calculations (net revenue, settlement, Finance page totals, Audit Mode) flow from this function and will auto-correct.

