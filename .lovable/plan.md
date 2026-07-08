## Restore Fleet Runway Card — Real Data Only

You're right — I over-corrected and deleted the card itself. Bringing the "Fleet Runway · Cost-Per-Day vs Month-to-Date Revenue" card back on Finance → Overview, but rebuilding every input from live database records instead of the hardcoded matrix and default constants.

### Data sources (all from real tables)

| Runway input | New source |
| --- | --- |
| `fixedMonthly` | Sum of trailing 90-day `expenses` rows whose `expense_type` is one of the recurring-overhead types (Truck Payment, Trailer Payment, Licensing/Permits, Registration/Plates, Insurance, LCN/Satellite, Cell Phone, Truck Warranty, CPP/Benefits, IFTA), divided by 3 → true monthly run-rate. |
| `avgFleetMpg` | Trailing 90-day fleet miles ÷ trailing 90-day `fuel_purchases.gallons` (already computed today). |
| `fuelPricePerGallon` | Trailing 90-day `fuel_purchases.total_cost` ÷ `fuel_purchases.gallons` (weighted average of what the fleet actually paid). |
| `plannedDispatchDays` | Count of distinct `delivery_date`s in the trailing 30 days across `fleet_loads`. |
| `plannedMilesPerDay` | Trailing 30-day actual/booked miles ÷ `plannedDispatchDays`. |
| `projectedFuelMonthly` | `(plannedMilesPerDay × plannedDispatchDays ÷ avgFleetMpg) × fuelPricePerGallon`. |
| `costPerDay` | `(fixedMonthly + projectedFuelMonthly) ÷ plannedDispatchDays`. |
| `monthToDateRevenue` | Sum of `fleet_loads.gross_revenue` + `agent_commissions.commission_amount` where date is in the current calendar month (already real). |
| `monthToDateDays` | Distinct dispatch days observed so far this month. |
| `breakEvenMTD` | `costPerDay × monthToDateDays`. |

If a source has no rows (e.g. no fuel purchases yet), that input is `0` and the card renders a small "Insufficient data — add fuel purchases / expenses to activate" hint in place of the missing figure. Nothing is fabricated.

### Files touched

- `src/hooks/usePLTrend.ts` — re-add `RunwayMetrics` type and `runway` field; compute all fields from the queries above (adds a trailing-30d loads query and fuel `total_cost` to the existing fuel query). No default constants, no options parameter.
- `src/components/finance/PLSummaryTab.tsx` — re-add the `FleetRunwaySection` component and render it under the KPI row. The Cost-Per-Day breakdown lists the actual expense categories that contributed to `fixedMonthly` (grouped by `expense_type`, showing each type's monthly avg), plus the projected-fuel line. The Break-Even gauge and MTD/Break-Even/Delta trio stay exactly as before, just fed by real numbers.
- Add empty-state fallbacks in the card when `fixedMonthly === 0`, `avgFleetMpg === 0`, or `plannedDispatchDays === 0`.

### Out of scope

- No new tables, migrations, or company_settings keys.
- No changes to the maintenance opportunity-cost fix from the last turn.
- The demo-seed edge function stays as-is (only the demo user sees it).