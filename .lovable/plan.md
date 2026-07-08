## Goal
Rewrite payroll batch calculations to run off a driver **base salary + bonus + holiday** (independent of load revenue), make those fields live-editable in the grid, and add an "exempt" workflow that archives non-applicable historical tax filings.

## 1. Schema changes (single migration)

- `drivers`: add `base_salary_per_period numeric default 0` (nullable-safe).
- `internal_payroll_ledger`: add `base_salary numeric default 0`, `bonus_pay numeric default 0`, `holiday_pay numeric default 0`. Keep `gross_line_haul` / `pass_through_fsc` for backwards compatibility but stop populating them going forward.
- `tax_filing_completions`: add `is_exempt boolean default false`, `exempt_reason text`, and make `confirmation_reference` / `filed_on` nullable so an exempt row can be recorded without a filing ref. Enforce via CHECK: `(is_exempt = true) OR (confirmation_reference IS NOT NULL AND filed_on IS NOT NULL)`.
- Seed Timothy Ames' `drivers.base_salary_per_period = 2000` when the driver exists in the current org (idempotent update, no-op otherwise).

## 2. Tax engine (`src/utils/payCalculations.ts`)

- Add `calculateGrossTaxablePay({ baseSalary, bonusPay, holidayPay })` returning the sum (min 0). Documented as the sole input to FICA on W-2 salary drivers.
- Add second overload path in `calculatePayrollTaxes` behavior — unchanged math (6.2% SS capped at $184,500 YTD, 1.45% Medicare). The caller now passes salary-derived gross instead of load-derived gross.
- Deprecate (but keep) `calculateLineHaulBase` — no longer called by the batch generator. Update JSDoc to reflect legacy-only status.
- Extend unit tests: base $2000 + bonus $500 + holiday $200 → EE SS $167.40, EE Medicare $39.15; verify SS cap crossover still works with salary path; verify 1099 zeroing.

## 3. Active Payroll Batch tab (`src/components/finance/inhouse-payroll/ActiveBatchTab.tsx`)

- Rewrite `generateBatch`: for each active driver, upsert one draft ledger row with `base_salary = drivers.base_salary_per_period ?? 0`, `bonus_pay = 0`, `holiday_pay = 0`. Skip drivers whose base is 0 unless a row already exists (so payroll admin can still add bonuses to a $0-base driver by inserting manually via a "Add row" button — deferred).
- Grid columns: Driver · Model · **Base Salary** (read-only) · **Bonus Pay** (editable) · **Holiday Pay** (editable) · **EE Tax** (auto) · **ER Tax** (auto, read-only) · **FIT Override** (editable) · **Net Payout** (live) · Status · Actions.
- Bonus, Holiday, FIT are all `type="number"` inputs, disabled when `status='finalized'`.
- Live math on every keystroke, no round-trip: `taxable = base + bonus + holiday`; run `calculatePayrollTaxes` locally against `taxConfig`; `Net = taxable − (eeSS + eeMed + fit)`. Show computed EE and ER totals in their columns.
- "Save" button per dirty row persists `bonus_pay`, `holiday_pay`, `federal_withholding_override`, recomputed `gross_taxable_pay`, and upserts `tax_withholding_ledger` with the fresh split from the engine. "Reset" ghost button per dirty row.
- On Finalize (Truist tab), the row is already staged — no extra handshake needed since the Truist tab reads the same ledger.

## 4. Truist ACH Staging tab

- Rename primary button from "Submit Payout" to **"Confirm Payout"** (existing finalize mutation logic unchanged).
- Recompute displayed Net using `base_salary + bonus_pay + holiday_pay − (ee tax sum)` so the two tabs stay consistent when the ledger comes from the new salary path. Legacy rows (base=0, gross_line_haul>0) fall back to the old formula.
- Keep "Pending Bank Release" (amber) → "Settled" (green, locked) badge states.

## 5. Tax Filing Registry — Void / Exempt

Files:
- `src/components/finance/inhouse-payroll/TaxFilingRegistryTab.tsx`
- New: `src/components/finance/inhouse-payroll/VoidExemptDialog.tsx`

Behavior:
- Add **"Void / Exempt (No W-2 Employees)"** ghost button next to every non-completed row.
- Dialog collects a required `exempt_reason` (textarea, max 300 chars, default text: "No W-2 employees during this period"). Submit inserts into `tax_filing_completions` with `is_exempt=true`, `confirmation_reference=null`, `filed_on=null`, `exempt_reason=<value>`.
- After submission, the row leaves the primary table and appears in a collapsed **"Exempt / Archived filings"** panel below the main table, greyed out, showing form label, due date, and exempt reason. Panel is hidden behind a `<Collapsible>` labeled "N exempt filings" and starts collapsed.
- Rows with `is_exempt=true` never show Overdue/Due-Soon badges.
- Completed (filed) rows continue to render locked green in the main table (unchanged).

## 6. Driver-facing isolation
No changes under `src/components/drivers/` or `src/components/driver/`. All new controls live inside `/finance/inhouse-payroll`, gated by `has_payroll_access`.

## Technical notes
- All Supabase writes include `org_id` explicitly.
- `bonus_pay` / `holiday_pay` inputs clamp negatives at 0; UI shows current-value not defaultValue so live math reflects each keystroke.
- ER Tax column is display-only (SS + Medicare + TX SUI); it's not user-editable because the plan calls out only Bonus / Holiday / FIT as inputs. If the user later wants ER edits we can extend.
- YTD SS cap continues to sum finalized ledgers' `gross_taxable_pay` across the calendar year.
- Exempt-vs-filed distinction preserved by the new `is_exempt` column; CHECK ensures we never end up with a filed row that has no reference.

## Out of scope
- No bulk-exempt (per row only).
- No editing of an exempt record (would require new UPDATE policy — currently INSERT-only for audit integrity). If they need un-exempt, we'd add a separate migration.
- No changes to `driver_payroll` / `driver_settlements` tables.
- No ER-tax inline editing.
