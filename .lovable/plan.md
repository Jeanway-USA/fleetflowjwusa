## Remove Driver Compliance Gate from Truck Assignment

Frontend-only cleanup. No DB, RLS, or edge-function changes. Unit 433780 and all truck/driver data untouched.

## Changes

### 1. `src/components/trucks/DriverAssignmentSelect.tsx`
Simplify to a plain driver picker:
- Drop the `evaluateDriverCompliance` helper, `DriverComplianceCheck` type, and `onComplianceChange` prop.
- Stop selecting `status`, `license_expiry`, `medical_card_expiry`, `credentials_review_status` — query only `id, first_name, last_name`.
- Remove the check/warning icons next to each driver option.
- Remove the yellow "Compliance blocks this assignment" banner and the green "CDL, medical card, and compliance docs are current" line.
- Keep the same exported component name and `value` / `onChange` signature so `Trucks.tsx` keeps working with no import changes.

### 2. `src/pages/Trucks.tsx`
- Remove any state that tracks the compliance check returned by `DriverAssignmentSelect` (e.g. `complianceCheck`, `onComplianceChange` wiring).
- Remove the Save-button `disabled` condition tied to compliance and any inline "Cannot assign driver: CDL expired/missing" / toast messages.
- Save writes `current_driver_id` directly with no pre-check.

### 3. Loan & Financing modal (Truck detail)
- In `src/components/trucks/AmortizationCard.tsx` (and `TruckLoanPaymentsSection.tsx` if it renders one), remove the top status banner referencing compliance documents. Financing math, progress bar, and payment ledger stay exactly as-is.

## Out of scope
- No changes to the `drivers` table, RLS, edge functions, cron jobs, amortization math, or the auto monthly loan → P&L posting.
- No changes to other compliance surfaces (Driver Compliance Hub, Credentials Review, dispatcher alerts) — this only removes the gate on truck assignment.
