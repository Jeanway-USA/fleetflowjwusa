# Unified Driver Compensation Mapper

## Note on target file
The actual per-driver Pay Type / Pay Rate / Employment Type editor lives in the driver add/edit dialog inside `src/pages/Drivers.tsx` (lines ~820–910). `DriverDetailSheet.tsx` is read-only view. I'll do the UI work in `src/pages/Drivers.tsx` (labeled "driver profile edit view" in the request) and mirror the new labels in `DriverDetailSheet.tsx`'s display so both stay in sync. `CompensationSettingsTab.tsx` stays untouched (org-level only).

## 1. `src/pages/Drivers.tsx` — Unified profile fields

Replace the current Employment Type + Pay Type + Pay Rate cluster with:

- **Worker Type toggle** (Tabs or SegmentedControl): `W-2 Employee` | `1099 Contractor`.
  - Stored as `employment_type`: `w2_company` or `1099_contractor`.
  - Existing `lease_purchase` drivers keep their value under the hood; a small notice appears on the form: "This driver is on a Lease-Purchase agreement. Switching worker type will end the agreement." A "Convert to 1099" / "Convert to W-2" button is the only path out. No lease UI is removed.

- **Pay Model dropdown**: `CPM (Cents Per Mile)` | `Percentage of Line-Haul` | `Flat Salary`.
  - Maps to canonical `pay_type`: `per_mile` | `percentage` | `flat`.
  - Existing `hourly` drivers still load correctly: if a driver's stored pay_type is `hourly`, the dropdown adds a fourth "Hourly (legacy)" option so their profile can still be saved without data loss. New drivers can't pick it.

- **Dynamic Rate input** — one field with label + suffix that switches on Pay Model:
  - CPM → label "Rate per Mile", suffix "¢", step 0.01, stored as dollars (e.g. `0.55`).
  - Percentage → label "Driver Split", suffix "%", step 0.5, 0–100.
  - Flat → label "Weekly Flat Rate", suffix "$/week", step 1.
  - Hourly (legacy only) → label "Hourly Rate", suffix "$/hr".

- Small inline helper text under the rate showing the resolved formula, e.g. "= 0.55 × booked miles per load".

## 2. `src/utils/payCalculations.ts` — Remove W-2 pay-model guardrail

Per the answer to Q3, W-2 drivers may now use any pay model. Changes:

- `calculateLoadPay`: drop the `if (employmentClass === 'w2' && (type === 'percentage' || type === 'flat'))` short-circuit that returns 0. W-2 uses the same base math as contractor; only the net-pay routing (tax withholding) differs.
- `calculateWeeklyPay` W-2 branch: extend to handle `percentage` and `flat`:
  - `percentage`: sum per-load base via `calculateLoadPay` (same as contractor).
  - `flat`: `base = weekly_flat_rate ?? pay_rate`.
  - Withholding applies to `grossPay = base + accessorialsTotal` (accessorials now flow into W-2 gross too, since they're real taxable wages).
- Keep `hourly` fully supported.
- Keep the accessorial rule as-is (FSC excluded from % base; only `is_driver_pay !== false` accessorials count) — matches Q4 answer.
- Update the module-header JSDoc to reflect the new W-2 rules.
- Update `src/utils/payCalculations.test.ts` cases that asserted "W-2 percentage/flat = 0" so they now assert the base math + withholding.

## 3. Export routing — RunW2PayrollDialog & SettlementPrintable

Verify (no behavior change if already correct):

- `src/components/finance/payroll/RunW2PayrollDialog.tsx`: confirm it consumes `calculateWeeklyPay(...).grossPay` and `.taxWithholding` for W-2 rows. If it currently reads only `.base` (miles×rate), swap to `grossPay` so accessorials + percentage/flat pay flow through. Adjust the "Gross Taxable Wages" column accordingly.
- `src/components/finance/driver-settlements/SettlementPrintable.tsx`: confirm the contractor settlement pulls `grossPay`, `reimbursements`, `deductions`, `netPay` from the same engine. No math changes expected — this is a read-through of the new engine output.

## 4. `src/components/drivers/DriverDetailSheet.tsx` — Label parity only

Update the read-only labels that mirror worker type + pay model so display matches the new form vocabulary ("W-2 Employee" / "1099 Contractor" / "CPM (¢/mi)" / "Percentage of Line-Haul" / "Flat Salary"). No new editable fields here.

## Verification

- Create a new W-2 driver with Pay Model = Percentage 25%. Add a load, open Payroll dialog → grossPay > 0, tax withheld ~22%.
- Create a 1099 driver with CPM 0.55. Add a load with 500 booked_miles → settlement shows base $275.
- Existing lease_purchase driver still opens without errors; lease agreement card still renders.
- Existing hourly driver still calculable via `calculateWeeklyPay`.
- `bunx tsgo --noEmit` clean; existing tests updated and pass.

## Out of scope

- No schema migration; `pay_type`/`employment_type` remain the same enum-ish text columns.
- No changes to `CompensationSettingsTab.tsx` (org-level revenue split settings stay separate).
- No changes to how lease-purchase deductions/escrows are computed.
