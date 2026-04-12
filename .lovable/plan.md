

## Fix Load Optimizer for Independent Mode

### Problem
In Independent mode, the owner-operator keeps 100% of the load revenue — there's no Landstar truck/trailer percentage split. Currently the Load Optimizer always applies truck % (default 65%) and trailer % splits, which is only correct for Landstar BCOs.

### Changes

**File: `src/pages/LoadOptimizer.tsx`**
- Import `useOrganizationMode` hook
- When `isIndependent` is true, override revenue settings to use `truckPct: 1.0`, `trailerPct: 0`, and skip the power-only toggle entirely (not applicable for independents)
- Hide the "Truck %" display in the footer stats when independent
- Hide the "Power Only" toggle when independent (power-only is a Landstar concept)
- The rest of the analysis (CPM overhead, deadhead, margin, go/no-go) stays the same

**No changes to `revenue-calculator.ts`** — passing `truckPct: 1.0` and `trailerPct: 0` already produces the correct result (net revenue = rate + FSC + accessorials).

### Result
Independent users see gross = net (100% of the load is theirs), and the optimizer focuses purely on whether the load covers operational costs and meets the target margin.

