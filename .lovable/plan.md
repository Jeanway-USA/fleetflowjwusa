
# Tax-Ready W-2 Payroll Rebuild

Goal: turn the Finances → Run Payouts section into a **fully automated W-2 payroll engine** that is IRS-ready, uses each driver's real W-4 + tax state, and requires no manual number entry. Only three buttons: **Generate Batch**, **Finalize Batch**, **Void / Delete**.

## 1. Remove ACH Staging entirely
- Delete the "Truist ACH Staging" section from `src/pages/Finance.tsx` and the `TruistAchStagingTab.tsx` component.
- Finalizing a batch will mark rows `finalized` directly (no ACH ref step). The `truist_payout_logs` table stays untouched in DB (historical) but is no longer surfaced in UI.

## 2. Real tax engine (replaces the stub `usePayrollTaxConfig` / stripped `calculatePayrollTaxes`)

Rewrite `src/utils/payCalculations.ts`'s payroll-tax section into a proper engine driven by `payroll_settings` + `driver_w4_info` + `state_tax_configurations`. New pure function:

```
calculateW2Payroll({
  grossTaxablePay,          // base + bonus + holiday (existing)
  ytdGrossTaxablePay,       // for SS wage-base cap
  ytdMedicareWages,         // for additional Medicare threshold
  payFrequency,             // weekly / biweekly / semimonthly / monthly
  w4: { filing_status, multiple_jobs, dependents_amount, other_income,
        deductions, extra_withholding, step_2c_checkbox },
  federalConfig: payroll_settings row (rates, wage bases, fit_brackets,
                                       standard_deduction),
  stateConfig: state_tax_configurations row for driver's tax_state,
})  → {
  fica: { eeSS, erSS, eeMedicare, erMedicare, addlMedicare },
  fit,                       // IRS Pub 15-T Worksheet 1A (percentage method,
                             //   2020+ W-4, annualized wages)
  state: { suta_er, sit_ee },
  totals: { eeWithholding, erLiability, netPay },
}
```

FIT algorithm (Pub 15-T Worksheet 1A):
```
annualWages     = grossTaxablePay * payPeriodsPerYear
adjustedAnnual  = annualWages + other_income
                  - (deductions + standardDeduction[filing])
                  - dependents_amount
                  (multiple_jobs / step_2c_checkbox flips to the
                   "Form W-4 Step 2 checkbox" bracket table)
annualFIT       = bracketLookup(fit_brackets[filing], adjustedAnnual)
periodFIT       = max(annualFIT, 0) / payPeriodsPerYear + extra_withholding
```

SUTA: `min(gross, max(0, suta_wage_base - ytdGrossTaxablePay)) * suta_rate` (employer-only).
SIT: `gross * sit_rate` (only if `has_state_income_tax`).
Additional Medicare: 0.9% on wages above threshold within the year (employee only).

Replace `usePayrollTaxConfig` with `usePayrollConfig` that returns the full `payroll_settings` row + a `state_tax_configurations` map keyed by state code. Ensure the row is seeded if missing.

## 3. Automatic Active Batch (no manual number inputs)

Rewrite `ActiveBatchTab.tsx`:

- Header shows the pay period (defaults to current week per `payroll_settings.pay_frequency`) with a small period navigator and one **Generate Batch** button.
- On Generate Batch: for every active W-2 driver
  1. Pull `base_salary_per_period`, W-4, tax state.
  2. Roll up **YTD gross / Medicare wages** from prior finalized ledger rows this calendar year.
  3. Compute bonus and holiday **automatically** from existing sources instead of manual input:
     - Bonus = safety-bonus accruals + any settlement bonus items dated in the period (existing `safety_bonus_settings` / `settlement_line_items` — bonus category).
     - Holiday = per-period holiday-pay entries from a new lightweight source: use `driver_settings.holiday_pay_period` if present; otherwise 0. (Automatic, no per-row input.)
  4. Call `calculateW2Payroll` and upsert `internal_payroll_ledger` + `tax_withholding_ledger`.
- Table shows read-only columns: Driver · Filing · Base · Bonus · Holiday · Gross · FIT · FICA (SS + Medicare) · SUTA · SIT · Net Payout · Status.
- No inline numeric inputs. Any driver-level tweak (filing status, extra withholding, base salary) is done on the driver profile — payroll re-computes on next Generate.
- **Edit action per row** → opens a small dialog that lets an admin only override the *inputs* that are legitimately per-run: an additional one-time bonus and an additional one-time deduction (both stored on the ledger row). Everything else is derived. This preserves the "no manual FIT/net entry" rule while still supporting corrections.
- **Delete action per row**: allowed when status = `draft`; hard-deletes the ledger row (cascade drops `tax_withholding_ledger`). Uses existing RLS delete policy.
- **Void action per row**: allowed when status = `finalized`; flips row to a new `voided` status and stamps `voided_at` / `voided_by` (small migration: extend `internal_payroll_ledger.status` check + add `voided_at`, `voided_by`, plus loosen the `protect_finalized_payroll_ledger` trigger so `finalized → voided` is the one legal transition). Voided rows are excluded from YTD accumulators.
- **Finalize Batch button** (batch-level): flips all `draft` rows in the period to `finalized`, stamps `finalized_at` / `finalized_by`, and triggers PDF stub regen through existing `generateW2PayStubPdf`.

## 4. Batch summary card

Above the table, show live totals for the period:
- Employees paid · Total Gross · Total FIT · Total FICA (EE + ER) · Total SUTA · Total SIT · Total Net Pay · Total Employer Tax Liability.

These come straight from the ledger + withholding rows — no client math.

## 5. Compliance / analytics tabs
- Keep the existing **Tax & Compliance** tab (Tax Filing Registry) unchanged.
- Update the payroll YTD widgets on the Analytics tab to sum from the new columns (they already do — just verify after the calc engine changes).

## 6. Migration (schema-only, minimal)

```sql
ALTER TABLE public.internal_payroll_ledger
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid,
  ADD COLUMN IF NOT EXISTS one_time_bonus     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS one_time_deduction numeric NOT NULL DEFAULT 0;

-- Update protect_finalized_payroll_ledger() to allow finalized → voided,
-- and to allow one_time_* edits pre-finalize only.
```

No new tables. All grants/RLS already in place.

## Technical details

- Files touched (frontend): `src/pages/Finance.tsx`, `src/components/finance/inhouse-payroll/ActiveBatchTab.tsx`, delete `TruistAchStagingTab.tsx`, new `EditPayrollRowDialog.tsx`, new `BatchTotalsCard.tsx`, `src/hooks/usePayrollConfig.ts` (replaces `usePayrollTaxConfig.ts`), `src/utils/payCalculations.ts` (extend tax engine), tests in `src/utils/payCalculations.test.ts`.
- `driver_payroll` table (used for pay stub PDFs) keeps working — the PDF generator already reads the withholding rows.
- Idempotent Generate Batch: existing `draft` rows are updated in-place; `finalized`/`voided` rows are skipped.
- All numeric formatting via existing `formatCurrency`; no hardcoded colors; uses existing shadcn primitives.

## Verification
1. Run Generate Batch for the current week on a driver with `base_salary_per_period = 2000`, filing single, FL: FIT ≈ Pub 15-T output for $2,000 weekly; FICA = 6.2% + 1.45%; SUTA = 2.7% on wages up to $7k; SIT = 0.
2. Same driver, TX tax state: SUTA uses TX row; SIT = 0.
3. Delete draft row → row gone. Void finalized row → row status becomes `voided`, excluded from YTD next run.
4. No inputs anywhere in the payroll table except the Edit dialog's optional one-time bonus/deduction.

Ends with the user seeing an accurate, IRS-ready W-2 payroll table generated by a single button click.
