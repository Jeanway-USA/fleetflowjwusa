## Truck Loan Balance — Fix & Payment Logging

### Problem
The Trucks table "Loan" column reads `loan_balance`, but admins have been entering the **original loan amount** there and never decrementing it. There's no way to log payments and no visual signal when a loan is paid off.

### Task 1 — Schema (migration)
Add to `public.trucks`:
- `original_loan_amount numeric` — the starting principal (immutable reference).
- Keep existing `loan_balance numeric` as the **remaining balance**.
- Backfill: `UPDATE trucks SET original_loan_amount = loan_balance WHERE original_loan_amount IS NULL AND loan_balance IS NOT NULL;`

New ledger table `public.truck_loan_payments`:
- `id`, `org_id`, `truck_id` (FK trucks), `payment_date date`, `amount numeric`, `note text`, `created_by uuid`, `created_at`, `updated_at`.
- GRANTs to `authenticated` + `service_role`, RLS enabled.
- Policies: SELECT/INSERT/UPDATE/DELETE limited to same-org users with `has_admin_access(auth.uid())` (owner/payroll_admin/dispatcher/safety per existing helper) — matches how other truck-financial data is scoped.
- Trigger to auto-set `org_id` from `get_user_org_id(auth.uid())` when null (mirrors existing `set_trucks_org_id` pattern).
- Trigger on INSERT: `UPDATE trucks SET loan_balance = COALESCE(loan_balance,0) - NEW.amount WHERE id = NEW.truck_id AND org_id = NEW.org_id;`
- Trigger on DELETE: reverse (`+ OLD.amount`).
- Trigger on UPDATE of amount: apply delta.
- `updated_at` trigger.

### Task 2 — Trucks list column
`src/pages/Trucks.tsx`, `loan` column render:
- Read `truck.loan_balance` (still the remaining balance).
- If `loan_balance <= 0` **and** `original_loan_amount > 0` → green "Paid Off" badge (`bg-success/10 text-success border-success/20`).
- If `loan_balance > 0` → `${formatCurrency(loan_balance, {maximumFractionDigits:0})} Remaining` in the mono badge.
- If both null/0 → em dash.
- Rename header to "Loan Balance".

### Task 3 — Edit form + Log Payment
In the truck edit dialog (`src/pages/Trucks.tsx`):
- Add `original_loan_amount` input right above `loan_balance`; relabel `loan_balance` to "Remaining Loan Balance ($)".
- Add a "Log Loan Payment" section (only visible when editing an existing truck with a loan): amount input + optional date + note + "Record Payment" button. On submit, insert into `truck_loan_payments` (trigger decrements `loan_balance`), invalidate the trucks query, toast confirmation.
- Below the button, show a compact recent-payments list (last 5) with delete buttons that reverse the payment via row delete.

In the truck detail view (`viewingTruck` block), show both:
- Original Loan Amount
- Remaining Balance (or "Paid Off" badge)
- Small payments history table.

### Task 4 — Zero-state
Handled in the badge logic above; also shown as a green "Paid Off" pill in the detail view when `loan_balance <= 0 && original_loan_amount > 0`.

### Files
- `supabase/migrations/*` — new column, table, GRANTs, RLS, triggers.
- `src/pages/Trucks.tsx` — column render, form fields, payment logger UI, detail view update.
- Supabase types will regenerate after migration approval.

### Out of scope
No changes to interest/APR math, amortization schedules, or maintenance columns.
