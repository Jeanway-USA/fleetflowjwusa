
# W-2 Payroll Module

Extends the existing contractor-focused Settlements/`driver_payroll` flow with a full W-2 track: automated FIT/FICA withholding, employer-side FICA + Florida SUTA accrual, editable tax config, and immutable pay-stub PDFs visible to both admins and drivers.

## 1. Database

### `driver_payroll` (extend existing table)
Add W-2 columns (nullable so 1099 rows stay untouched):
- `employment_type` — `w2_company` | `1099_contractor` | `lease_purchase` (mirrors drivers.employment_type at time of run, snapshot)
- `gross_pay` (already present or reuse existing gross column)
- Withholdings: `federal_income_tax`, `social_security_tax`, `medicare_tax`, `additional_medicare_tax`
- Employer accruals: `employer_ss_tax`, `employer_medicare_tax`, `employer_fica_total`, `fl_suta_tax`, `fl_suta_wage_base_applied`
- `net_pay`, `pay_period_start`, `pay_period_end`, `payment_date`
- `stub_pdf_path` (storage path in private bucket), `stub_generated_at`
- `filing_status` snapshot (`single` | `married_joint` | `head_of_household`), `w4_allowances` snapshot, `w4_extra_withholding` snapshot

### New table `public.payroll_settings` (per org, editable)
- `org_id` unique
- `fit_brackets` jsonb — 2026 IRS Pub 15-T Percentage Method (annual) brackets per filing status. Seeded with published 2026 single-filer values (10/12/22/24/32/35/37% brackets).
- `standard_deduction` jsonb — per filing status
- `social_security_rate` numeric default 0.062
- `social_security_wage_base` numeric default 176100 (2026)
- `medicare_rate` numeric default 0.0145
- `additional_medicare_rate` numeric default 0.009
- `additional_medicare_threshold` numeric default 200000
- `suta_rate` numeric default 0.027 (FL new-employer)
- `suta_wage_base` numeric default 7000 (FL)
- `pay_frequency` text default `weekly` (weekly/biweekly/semimonthly/monthly — affects annualization)
- Standard org grants + RLS: owner/payroll_admin manage; service_role full.

### New table `public.driver_w4_info`
Per-driver W-4 config used at each run (kept out of `drivers` to avoid audit noise):
- `driver_id` unique, `org_id`
- `filing_status`, `multiple_jobs` bool, `dependents_amount`, `other_income`, `deductions`, `extra_withholding`, `step_2c_checkbox`
- RLS: driver reads own row; owner/payroll_admin manage.

All new tables: GRANT + RLS + `updated_at` trigger + audit trigger.

### Storage
Reuse existing private documents bucket with prefix `payroll-stubs/{org_id}/{driver_id}/{payroll_id}.pdf`. RLS: owner/payroll_admin read all in org; driver reads only their prefix.

## 2. Backend — Edge Function `run-w2-payroll`
`verify_jwt = true`, gated by `has_payroll_access()`.

Input: `driver_ids[]`, `period_start`, `period_end`, `payment_date`, optional per-driver `gross_pay_override` (defaults to computed gross from hours/miles via existing `calculateWeeklyPay`, or $1,700 fallback if unset).

Algorithm (per driver):
1. Load `payroll_settings` + `driver_w4_info` (fallback: single, no adjustments).
2. Compute FIT via IRS Pub 15-T **Percentage Method** — annualize gross by frequency, subtract standard deduction, apply bracket table, add extra withholding, divide back to period.
3. Social Security: `min(YTD-applied-wages + gross, wage_base) → taxable × 6.2%` (employee + matching employer).
4. Medicare: `gross × 1.45%` employee + employer; add 0.9% additional over $200k YTD (employee only).
5. Employer FICA total = employer SS + employer Medicare (the 7.65% match, capped by wage bases).
6. FL SUTA: `min(period_wages, remaining_ytd_wage_base) × suta_rate` (employer only, no employee deduction).
7. Net pay = gross − (FIT + SS + Medicare + addl Medicare).
8. Insert `driver_payroll` row (snapshot all rates/config).
9. Generate immutable PDF stub server-side, upload to storage, save `stub_pdf_path`.

YTD lookup: sum prior `driver_payroll` rows for driver in current calendar year.

## 3. UI

### Finance → Driver Settlements tab (existing)
- Add filter chip row: **All / W-2 / 1099 / Lease Purchase** (reads `drivers.employment_type`).
- Row badge shows employment type.
- **"Run Payroll"** button branches:
  - Selected drivers all W-2 → open new **RunW2PayrollDialog**
  - Otherwise → existing GenerateSettlementsDialog
  - Mixed selection → dialog asks user to split runs.

### `RunW2PayrollDialog` (new)
- Period + payment date pickers
- Per-driver row: gross pay (editable, default from calc or $1,700), live preview of FIT / SS / Medicare / **Employer FICA match** / **FL SUTA accrual** / Net pay
- Footer totals: Total gross, Total employee withholding, **Employer tax liability (FICA match + SUTA)**, Total net
- Confirm → calls `run-w2-payroll`, shows toast + refreshes table.

### Payroll history (admin)
- New section in Settlements tab: "Pay Stub History" listing `driver_payroll` W-2 rows with columns: driver, period, gross, FIT, SS, Medicare, net, employer FICA, SUTA, **[View PDF] [Download PDF]**.

### Driver Dashboard
- New **"Pay Stubs"** card listing the driver's own W-2 payroll rows with **[Download PDF]** button (signed URL to their stub only).

### Company Settings → new **"Payroll Taxes"** card
- Edit SUTA rate, wage base, pay frequency, view/edit FIT brackets (JSON editor with reset-to-2026-defaults button), SS/Medicare rates + wage base.
- Owner/payroll_admin only.

## 4. Technical notes

- `has_payroll_access(auth.uid())` gates all RLS write policies and the edge function.
- All monetary math server-side in the edge function; UI preview uses a shared TS helper `src/lib/w2-payroll.ts` that mirrors the formulas for consistent display.
- PDF generation reuses existing `src/lib/pdf/generateSettlementPdf.ts` pattern (jsPDF) via a new `generateW2PayStubPdf.ts` on the edge function side (Deno + npm:jspdf).
- Audit: rely on existing `log_audit_event` trigger on `driver_payroll`; add trigger on `payroll_settings` + `driver_w4_info`.
- No changes to contractor/lease pay math — `payCalculations.ts` stays authoritative for gross.

## 5. Out of scope (flagged for later)
- Year-end W-2 form generation
- State income tax (FL has none; multi-state would need a jurisdiction column)
- 401(k) / benefits pre-tax deductions
- Direct deposit ACH file export
