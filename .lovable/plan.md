# Multi-State Tax Hub + W-2 / 1099 Generation

Build a dedicated **Tax Hub** under `/admin/tax-hub` that centralizes multi-state employer tax tracking and generates IRS-accurate W-2 and 1099-NEC forms for each worker. The Payroll section on Finance stays focused on running payroll; the Tax Hub is the compliance + reporting brain.

## 1. Route and navigation

- New page `src/pages/admin/TaxHub.tsx` at `/admin/tax-hub`, guarded by `owner` + `payroll_admin`.
- Add a link to the admin section of the sidebar next to "Document Templates".
- Move `TaxFilingRegistryTab` into Tax Hub (kept intact) so all tax compliance lives in one place. Finance keeps only "Active Batch" and "History".

## 2. Tax Hub layout

Single page with four tabs:

### Tab A — Multi-State Overview
Table of every state the company has active employees in (derived from `drivers.tax_state` where `employment_type = 'W2'`). Columns: State, Active Employees, YTD Wages, YTD SUTA Accrued, YTD SIT Withheld, SUTA Rate, SUTA Wage Base, Has SIT, Registration #, Deposit Frequency, Status.

Data sources:
- Wages / SUTA / SIT: sum `internal_payroll_ledger` + `tax_withholding_ledger` (status ∈ finalized) grouped by driver's tax state for the current year.
- Rates: `state_tax_configurations` row per state (already seeded).

Each row opens a **State Detail Sheet** that lets an owner edit the state-level values that aren't legally fixed:
- SUTA rate (assigned yearly by each state agency)
- SUTA wage base (set by state law but stored here for override / historical)
- SIT rate / has SIT toggle
- State registration number (SUTA account ID, SIT withholding ID)
- Deposit frequency (monthly / quarterly / annual)
- Contact/agency notes

These edits write back to `state_tax_configurations` (new columns added below).

### Tab B — Federal Overview
Cards summarizing YTD employer-side federal position:
- Total wages (Box 1 basis)
- Total FIT withheld
- Total FICA (employee + employer)
- Additional Medicare withheld
- FUTA accrued (0.6% × min(wages, 7000) per employee)
- 941 quarterly rollups (Q1–Q4) with links into the existing Filing Registry rows for the matching quarter.

### Tab C — W-2 Preparation
One row per W-2 employee for the selected tax year (year selector defaults to prior calendar year Jan–Mar, else current year).
Columns: Employee, SSN status (has W-4 + address? warning icons), Box 1 Wages, Box 2 FIT, Box 3 SS Wages, Box 4 SS Tax, Box 5 Medicare Wages, Box 6 Medicare Tax, State, Box 16 State Wages, Box 17 State Tax, Status (Draft / Issued).

Actions per row: **Preview**, **Generate W-2 PDF**, **Mark Issued**, **Regenerate**.
Bulk action: **Generate All W-2s** (produces one merged PDF and stores each individual PDF in storage under `w2/{year}/{driver_id}.pdf`).

Box numbers computed from finalized `internal_payroll_ledger` + `tax_withholding_ledger` rows for the year (voided rows excluded). The generator prints the official IRS 2024/2025 Form W-2 layout — clean typography, exact field positioning — matching what the IRS accepts for employee copies (Copy B/C/2). Employer Copy A must be filed electronically via SSA Business Services Online; Tax Hub links out and stores a confirmation ref via the existing Filing Registry.

### Tab D — 1099-NEC Preparation
Same shape as Tab C but for contractors (`employment_type = '1099'` or Independent drivers).
Pulls totals from `driver_settlements` net taxable pay for the year (excluding reimbursements and pass-through FSC). Threshold: only include workers ≥ $600 in the year (with a "show below threshold" toggle).
Columns: Contractor, TIN status (from `driver_w9_info.tin_last4`), Legal Name (from W-9), Address (from W-9), Total Nonemployee Compensation (Box 1), Federal Tax Withheld (Box 4), State Tax Withheld (Box 5), Status.

Actions: **Preview**, **Generate 1099-NEC PDF**, **Mark Issued**, **Regenerate**. Bulk: **Generate All 1099s**.

Missing W-9 data blocks generation with a clear inline warning and a shortcut into the driver profile W-9 form.

## 3. PDF generators

Two new modules under `src/lib/pdf/`:
- `generateW2Pdf.ts` — builds one W-2 per employee using existing `pdf-lib`/`jspdf` stack (same as `generateW2PayStubPdf`). Renders the 2024/2025 W-2 employee-copy layout with all lettered/numbered boxes.
- `generate1099NecPdf.ts` — builds the 1099-NEC 2024/2025 Copy B layout.

Each accepts a `year` + `driverId` and reads directly from ledger data via a small server-side aggregator (see §5) so a client can render without recomputing math.

Both save the resulting file to storage bucket `tax-documents` under `{org_id}/{year}/w2/{driver_id}.pdf` or `.../1099/{driver_id}.pdf`, and insert a `tax_documents` row (table already exists) so the driver's profile "Tax Documents" section (existing `DriverTaxDocuments.tsx`) automatically shows them for download.

## 4. Data model changes (single migration)

```sql
-- Extend per-state config with registration + cadence
ALTER TABLE public.state_tax_configurations
  ADD COLUMN IF NOT EXISTS suta_account_number text,
  ADD COLUMN IF NOT EXISTS sit_account_number  text,
  ADD COLUMN IF NOT EXISTS deposit_frequency   text
    CHECK (deposit_frequency IN ('monthly','quarterly','annual','semiweekly')),
  ADD COLUMN IF NOT EXISTS agency_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Aggregator RPC used by W-2 / 1099 tabs (SECURITY DEFINER, org-scoped).
CREATE OR REPLACE FUNCTION public.get_w2_totals(_year int)
RETURNS TABLE (
  driver_id uuid, wages_box1 numeric, fit_box2 numeric,
  ss_wages_box3 numeric, ss_tax_box4 numeric,
  medicare_wages_box5 numeric, medicare_tax_box6 numeric,
  state_code text, state_wages_box16 numeric, state_tax_box17 numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ ... $$;

CREATE OR REPLACE FUNCTION public.get_1099_totals(_year int)
RETURNS TABLE (
  driver_id uuid, nonemployee_comp_box1 numeric,
  fed_tax_withheld_box4 numeric, state_tax_withheld_box5 numeric,
  state_code text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ ... $$;
```

`tax_documents` (already exists, 7 cols, 5 policies) is reused — no schema change needed there.

## 5. What we still need from you

Confirm/answer so the output is legally accurate:

1. **Form year to target first.** Should the Tax Hub launch with **2025 forms** (calendar year we're currently in, printed Jan 2026) or **2024 forms** (prior year, still typical use case)? The layout is nearly identical but box wording differs.
2. **Employer identity for forms.** Confirm we should read the employer name, EIN, and address from `organizations` and `company_settings`. If EIN isn't already stored, we'll add an EIN field to Company Settings.
3. **State registration numbers.** For each state where you have W-2 employees, do you already have your SUTA and SIT account numbers? If yes, we'll surface a "Complete state setup" prompt on first load; if no, forms print with a placeholder and a warning.
4. **1099 delivery preference.** Should generated 1099s auto-email to the contractor (via existing Resend integration), or only save to storage for the owner to distribute?
5. **Copy A / e-filing.** Do you want Tax Hub to also produce the IRS **e-file transmittal file** (`EFW2` for W-2s, `IRIS`/`FIRE` XML for 1099s), or is generating the recipient copies + a printable employer copy sufficient for now? E-file generation is a much larger scope; I recommend Phase 2.

## Technical details

- Files: new `src/pages/admin/TaxHub.tsx`, new components under `src/components/tax-hub/`: `MultiStateOverviewTab.tsx`, `FederalOverviewTab.tsx`, `W2PreparationTab.tsx`, `Form1099Tab.tsx`, `StateDetailSheet.tsx`, `W2PreviewDialog.tsx`, `Form1099PreviewDialog.tsx`. New PDF modules `src/lib/pdf/generateW2Pdf.ts`, `generate1099NecPdf.ts`. New hook `src/hooks/useTaxHubData.ts` wrapping the two RPCs. Route added to `App.tsx`. Sidebar link added.
- Auth: `owner` + `payroll_admin`.
- No hardcoded colors; uses existing shadcn primitives, `formatCurrency`, and design tokens.
- All queries org-scoped; RLS unchanged since we reuse existing tables.

## Verification

1. Multi-State tab shows one row per state that has an active W-2 driver, with YTD wages matching the sum of finalized ledger rows.
2. Federal tab totals reconcile to the sum of state-level YTD wages within $0.01.
3. Generating a W-2 for a test driver: Box 3 = min(wages, SS wage base); Box 4 = Box 3 × 6.2%; Box 5 = full wages; Box 6 = Box 5 × 1.45% + addl-Medicare; Box 16 uses driver's tax state.
4. Generating a 1099 for a contractor with ≥ $600 shows the exact NEC total from settlements; contractor below $600 hidden unless toggled.
5. Missing W-9 (no `tin_last4`) blocks 1099 generation with an inline warning.
