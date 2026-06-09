# Unified Driver Pay Calculation

## Goal
One source of truth for driver pay. Every dashboard, dispatcher view, finance tab, and driver card calls the same function, with identical results.

## Task 1 — Create `src/utils/payCalculations.ts`

A single module exporting:

- `PayType = 'percentage' | 'per_mile' | 'cpm' | 'flat' | 'hourly'`
- `calculateLoadPay({ load, driver, settings })` — pay for ONE load
- `calculateWeeklyPay({ loads, driver, settings, hoursWorked? })` — pay for a set of loads in a pay period
- `getPayBreakdown(...)` — returns `{ base, accessorialsTotal, total, formulaLabel }` for UI display

### Inputs
- `load`: `{ rate, fuel_surcharge, booked_miles, load_accessorials[] }`
- `driver`: `{ pay_type, pay_rate, weekly_flat_rate?, hourly_rate? }`
- `settings` (org-level, with sane defaults):
  - `landstarSplit` — number, default `0.65`. Applied **only when `tmsMode === 'landstar'`**. In Independent mode the split is `1.0`.
  - Read from `organizations` (existing column or new `landstar_split` numeric; default 0.65 in code if missing — no schema change required for this task).

### Formulas (strict)

**Percentage** (per load)
```
base       = load.rate * (tmsMode === 'landstar' ? landstarSplit : 1)
basePay    = base * (driver.pay_rate / 100)
total      = basePay + accessorialsTotal
```
FSC is **excluded** from the percentage base. Accessorials add on top, at 100%.

**Mileage** (`per_mile` / `cpm`, per load)
```
total = (load.booked_miles || 0) * driver.pay_rate + accessorialsTotal
```

**Flat** (per week, not per load)
```
weeklyTotal = driver.weekly_flat_rate (or pay_rate as fallback)
            + sum(accessorials across delivered loads that week)
```
Per-load pay for flat drivers returns `{ base: 0, accessorialsTotal, total: accessorialsTotal }` so per-load UIs show accessorials only and the weekly widget shows flat + accessorials.

**Hourly** (preserved as-is)
```
weeklyTotal = (hoursWorked ?? 0) * driver.hourly_rate (or pay_rate)
```
No per-load calculation; existing hourly configuration UI in CompensationSettingsTab / driver card stays intact.

### Behavior
- All inputs coerced via `Number(x ?? 0)` to avoid NaN.
- `cpm` is treated as alias for `per_mile`.
- Returns zero when required fields are missing rather than throwing.
- Pure function, no React/Supabase imports — easy to unit test.

## Task 2 — Refactor sites

Replace inline math at every site with `calculateLoadPay` or `calculateWeeklyPay`. The `tmsMode` comes from existing `useOrganizationMode()`; pass it (and org's `landstarSplit`) into the helper.

| File | Current logic | Replace with |
|---|---|---|
| `src/components/driver/ActiveLoadCard.tsx` (L166–171) | `(rate + accessorials) * pct` / `miles * rate` | `calculateLoadPay` |
| `src/components/driver/DriverPayWidget.tsx` (weekly earnings block) | inline % and per-mile sums | `calculateWeeklyPay` |
| `src/components/driver/WeeklyPerformanceWidget.tsx` | inline math + flat branch | `calculateWeeklyPay` |
| `src/components/driver/DriverLoadsView.tsx` (L135–137) | `(rate + fsc) * pct` ❌ wrong, uses FSC | `calculateLoadPay` |
| `src/components/driver/MyPaystubsDialog.tsx` | inline per-period math | `calculateWeeklyPay` |
| `src/pages/DriverStats.tsx` (L173–176) | inline % and per-mile | `calculateLoadPay` in the reducer |
| `src/pages/DriverSpectatorView.tsx` | passes pay props only | no math change, ensure children use util |
| `src/components/finance/SettlementsTab.tsx` (L283–288) | `grossRevenue * pct` ❌ wrong (no 65% split, includes FSC) | `calculateLoadPay` |
| `src/components/finance/driver-settlements/DriverSettlementsTab.tsx` | inline per-driver totals | `calculateWeeklyPay` |
| `src/components/finance/LoadProfitabilityTab.tsx` (driver-cost column) | inline pct math | `calculateLoadPay` |
| `src/components/finance/PLSummaryTab.tsx` (driver pay aggregation) | inline | `calculateWeeklyPay` per driver |
| `src/components/finance/CompensationSettingsTab.tsx` | settings UI only — confirm hourly inputs still work | unchanged math, keep hourly preserved |
| `src/components/executive/CompanyHealthScore.tsx`, `FleetStatusCard.tsx`, `DriverAvailabilityCard.tsx` | aggregate-only references | switch any inline pay sums to util |
| `src/pages/LoadOptimizer.tsx` | profitability margin uses inline driver pay | `calculateLoadPay` |
| `src/hooks/useOperationalCPM.ts` | inline cost-per-mile that includes driver pay | `calculateLoadPay` for the driver-cost component |

Anything that already calls `formatPayRate` / `payTypeLabel` in `src/lib/pay-format.ts` stays — those are display helpers, not math.

## Task 3 — Verification

- Add `src/utils/payCalculations.test.ts` with cases for each pay type (Landstar + Independent), zero/NaN inputs, FSC exclusion, flat weekly aggregation.
- Smoke check: Driver Dashboard, Active Load Card, Paystubs dialog, Settlements tab, Driver Settlements tab, Load Profitability all render expected numbers for a sample percentage / mileage / flat / hourly driver.
- Typecheck runs automatically.

## Out of scope
- Schema changes (no new columns; `landstarSplit` defaults to 0.65 in code, read from `organizations.landstar_split` if present).
- Settlement reconciliation / Landstar XLSX parser math.
- Hourly UI changes (preserved as-is).
- Org-revenue split logic in `src/lib/revenue-calculator.ts` (that's company revenue, not driver pay).
