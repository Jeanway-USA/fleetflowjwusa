# Forward-Looking Cost-Per-Day Runway Dashboard

Add a predictive planning module to the finance P&L Summary that surfaces our daily break-even number and shows the current month's revenue against it as a live gauge.

## 1. Fixed Overhead Matrix (new config)

Create `src/config/fixedOverhead.ts` — a lightweight, editable array of the baseline monthly fixed costs the fleet carries whether trucks roll or not:

- Unladen (bobtail/non-trucking) liability
- Communications (ELD/phones/dispatch software)
- Physical damage insurance
- Vehicle lease payments
- Baseline driver salary profile (guaranteed W-2 minimums)

Each entry: `{ id, label, category, monthlyAmount, notes? }`. Exported helpers: `TOTAL_FIXED_OVERHEAD_MONTHLY` and `sumFixedOverhead(entries)`. Kept as a typed constant array now — no DB migration — so it's easy to lift into settings later.

## 2. Daily Break-Even Runway (hook update)

Extend `src/hooks/usePLTrend.ts` to also return a `runway` block:

```
runway: {
  fixedMonthly:        number   // from fixedOverhead.ts
  avgFleetMpg:         number   // trailing 90d miles ÷ fuel gallons (fallback 6.5)
  projectedFuelMonthly:number   // (planned miles/day × dispatch days) ÷ mpg × $/gal
  plannedDispatchDays: number   // configurable, default 22
  costPerDay:          number   // (fixedMonthly + projectedFuelMonthly) ÷ dispatchDays
  monthToDateRevenue:  number   // sum of gross_revenue + commissions this calendar month
  monthToDateDays:     number   // dispatch days elapsed MTD
  breakEvenMTD:        number   // costPerDay × monthToDateDays
}
```

Fuel $/gal and planned miles/day pulled from existing `fleet_settings` via `getSetting` (fallbacks `4.10` and `450`). No new tables, no new queries beyond what the hook already fetches (loads + expenses already include the range we need; add a small `fuel_purchases` select for MPG).

## 3. Target Revenue Gauge (UI)

In `src/components/finance/PLSummaryTab.tsx`, add a new section **"Fleet Runway"** directly under the existing triple-KPI row:

- Left card: **Cost Per Day** — big number, sub-line lists the matrix contributors (fixed $X + fuel $Y ÷ Z dispatch days).
- Right card: **Break-Even Gauge** — a semi-circular Recharts `RadialBarChart` where:
  - 0% → 150% of the MTD break-even line
  - Fill = `monthToDateRevenue / breakEvenMTD`
  - Color: red < 90%, amber 90–100%, green > 100% (semantic tokens `destructive` / `warning` / `success`)
  - Center label: current $ vs break-even $, delta chip showing "Net profit" / "Net loss" for the month so far.

All formatting via existing `formatCurrency` / `abbrevCurrency`. No changes to props coming into `PLSummaryTab`.

## Files touched

- `src/config/fixedOverhead.ts` (new)
- `src/hooks/usePLTrend.ts` (add `runway` to return type + computation)
- `src/components/finance/PLSummaryTab.tsx` (new Runway section + gauge)

## Out of scope

No schema changes, no settings UI for the overhead matrix (edit the config file for now), no changes to other P&L tabs.
