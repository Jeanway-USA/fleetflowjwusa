
## Safety

Unit 433780's row and all existing values (`loan_balance`, `monthly_payment`, `interest_rate`, `loan_term_months`, `loan_start_date`, `lender_name`, `original_loan_amount`, history in `truck_loan_payments`) are preserved verbatim. No columns dropped or renamed, no data rewrites, no destructive migrations.

## 1. Dynamic Financing & Amortization

The `trucks` table already stores the needed inputs. Upgrade the Truck detail financing card into a live amortization ledger.

- Config inputs (edit dialog on the truck): Total Equipment Cost (`original_loan_amount`), Down Payment (new field, see schema), Interest Rate (`interest_rate`), Monthly Payment (`monthly_payment`), Loan Term Months (`loan_term_months`), Loan Start Date (`loan_start_date`), Lender/Creditor (`lender_name`).
- Client-side amortization (`src/lib/amortization.ts`) computes on every render from stored inputs + `truck_loan_payments`:
  - Scheduled payments elapsed = months between `loan_start_date` and today, capped at term.
  - Actual payments made = sum from `truck_loan_payments` (already ledgered).
  - Remaining principal = amortized balance using standard formula `P·(1+r)^n − M·((1+r)^n − 1)/r` with adjustment for extra/short payments recorded in the ledger.
  - Payoff progress % = 1 − (remaining / original financed amount).
- New `AmortizationCard` component with a progress bar, totals row, and a month-by-month projection table (collapsible).

## 2. Multi-Vehicle & Lender Profile

- `Trucks.tsx` table already lists all trucks; add default sort by `unit_number` (natural sort so `433780` and `T-101` order sensibly) and a Lender column.
- `lender_name` already exists — surface it in the create/edit truck dialog as a combobox that suggests lenders already used in the org (e.g. "Dakota Financial"), free-text allowed.

## 3. Driver Assignment Compliance Gate

In the truck edit dialog's Driver dropdown (`current_driver_id`):
- Query drivers for the org and show a compliance badge per option: CDL, Medical Card, Drug Screen.
- Compliance rule (all must be true to enable Save):
  - `drivers.status = 'active'`
  - `drivers.license_expiry` is in the future
  - `drivers.medical_card_expiry` is in the future
  - A `driver_signed_documents` row of type drug screen / MRO clearance exists with `review_status = 'approved'` and no future revocation.
- Non-compliant drivers are still selectable but the Save button is blocked with an inline reason listing the failing checks; owner override toggle is out of scope for this pass.
- Enforced client-side; RLS/DB validation is not modified (no destructive change to existing triggers).

## 4. Auto Recurring Monthly Loan Payment → P&L

New edge-scheduled job that posts each active truck's monthly payment into `public.expenses`:

- Row per truck per month: `expense_type = 'Truck Loan'`, `amount = trucks.monthly_payment`, `truck_id`, `vendor = trucks.lender_name`, `expense_date = first of month`, `description = 'Auto: monthly loan payment'`, `is_approved = false` (owner reviews in Finance).
- Idempotent: skip if a row with the same `truck_id`, `expense_type = 'Truck Loan'`, and `expense_date` already exists.
- Also writes the same amount to `truck_loan_payments` so amortization + P&L stay in sync via the existing `apply_truck_loan_payment_to_balance` trigger.
- Runs on the 1st of each month via `pg_cron` calling a new edge function `post-truck-loan-payments`; a manual "Post this month's payment" button on the truck detail page triggers the same function for backfill.
- Historical entries for Unit 433780 are NOT backfilled automatically; existing `truck_loan_payments` and `expenses` rows are untouched.

## Technical

Schema (single additive migration):

```sql
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS down_payment numeric,
  ADD COLUMN IF NOT EXISTS financing_fees numeric;
```

No other schema changes. No RLS changes. No column drops/renames.

Files:
- `src/lib/amortization.ts` (new) — pure amortization math + unit-testable.
- `src/components/trucks/AmortizationCard.tsx` (new).
- `src/components/trucks/TruckLoanPaymentsSection.tsx` — keep; embed amortization card above.
- `src/pages/Trucks.tsx` — natural sort by unit_number, add Lender column, driver compliance gate in edit dialog.
- `src/components/trucks/DriverAssignmentSelect.tsx` (new) — driver dropdown with compliance badges.
- `supabase/functions/post-truck-loan-payments/index.ts` (new) — edge function + cron trigger via `supabase--insert` (never migration for cron per project convention).
- Types regenerate after the migration.

Out of scope: role/RLS changes, deleting or renaming any existing column, editing seed data, backfilling historical monthly loan expenses.
