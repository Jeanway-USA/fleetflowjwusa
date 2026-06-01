## Audit & Fix Driver Stats Page

Reviewed `src/pages/DriverStats.tsx`. Found several accuracy issues — all data inputs exist in the schema, but several calculations are wrong or misleading.

### Issues

1. **On-Time Rate is broken.** Code compares `load.updated_at` (last row update — any field change) to `delivery_date` parsed as midnight. There's no actual delivery timestamp captured anywhere; this card shows misleading numbers.
2. **Earnings miss Flat Rate drivers.** Only `'percentage'` and `'per_mile'` produce earnings; `'flat'` falls through to $0, which is wrong.
3. **Pay week ignores driver's custom pay-week start day.** Hardcoded `weekStartsOn: 1` (Monday). Other widgets read `driver_settings.pay_week_start_day`.
4. **Earnings calc diverges from DriverPayWidget.** Pay widget uses `booked_miles` and excludes `fuel_surcharge`; stats page uses `actual_miles` fallback and adds `fuel_surcharge`. Payroll pays on the widget formula, so stats should match.
5. **MPG and Cost/Mile divide by loaded miles only.** Trucks burn fuel on empty miles too — industry MPG = total miles ÷ gallons.
6. **Unused query.** `allTimeLoads` query runs every render and is never read.

### Fix Plan (frontend only)

In `src/pages/DriverStats.tsx`:

- Fetch `driver_settings_safe` for `pay_week_start_day`; use it when `period === 'weekly'` instead of hardcoded Monday.
- Replace earnings formula to mirror `DriverPayWidget`:
  - `'percentage'`: `(rate + accessorials) * payRate/100` using `booked_miles` semantics (no fuel_surcharge).
  - `'per_mile'`: `booked_miles * payRate`.
  - `'flat'`: leave earnings = 0 and render "—" with hint "Flat-rate pay — see payroll".
- Remove the On-Time Rate card and replace it with **Avg Revenue per Mile** ($/loaded mile), which is reliable.
- Drop on-time fields from `calculateStats`.
- Change MPG and Cost/Mile to use `totalMiles` (loaded + empty) rather than loaded only; update helper caption accordingly.
- Delete the unused `allTimeLoads` query and the `Clock` icon import if no longer needed.
- Keep equipment, mileage breakdown, fuel section, and period summary layouts unchanged.

No DB/schema changes needed.