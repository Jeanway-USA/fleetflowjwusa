# Fix Estimated Pay Display on Active Load Card

## Problem
For flat-rate drivers, `calculateLoadPay` returns `base = 0` (flat is paid weekly, not per load), so the per-load "Est." amount reduces to whatever driver-payable accessorials are attached. The card currently shows that as `Est. $50.00`, which misrepresents it as load pay.

## Change (frontend only — `src/components/driver/ActiveLoadCard.tsx`)

Use the already-computed `payBreakdown` to decide what to render:

- **Flat-rate drivers (`payType === 'flat'`)**
  - Compact row (line 321-324): if `payBreakdown.accessorialsTotal > 0`, render `Accessorial: $X.XX` (success color, dollar icon). If zero, hide the right-hand pay chip entirely so we don't show a misleading `$0.00`.
  - Expanded details row (line 490-499): replace the "Estimated Pay" tile with an "Accessorials" tile using the same value, or hide it when there are no driver-pay accessorials (the existing "Accessorials Breakdown" collapsible at 502 already covers detail).

- **All other pay types (`percentage`, `per_mile`/`cpm`, `hourly`, unknown)**
  - Keep current behavior: show `Est. {estimatedPay}` and the "Estimated Pay" tile unchanged.

No changes to `payCalculations.ts`, no schema changes, no other components. `sumAccessorials` already filters by `is_driver_pay !== false`, so the accessorial value shown is correctly driver-only.

## Files
- `src/components/driver/ActiveLoadCard.tsx` — two small conditional render swaps around lines 321-324 and 490-499.
