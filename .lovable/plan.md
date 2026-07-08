## Goal
Rip Gusto out of the app and ship a self-contained payroll/tax ledger under `/finance/inhouse-payroll`, plus a W-2 / 1099 filing calendar tab. Driver-facing screens stay untouched.

## 1. Remove Gusto (full removal)
Delete these files:
- `src/components/providers/GustoAppProvider.tsx`
- `src/lib/gusto/useGustoStatus.ts`, `src/lib/gusto/theme.ts` (whole `src/lib/gusto/` folder)
- `src/services/gustoCompanyApi.ts`
- `src/components/payroll/W2DriverSyncDashboard.tsx`
- `src/components/payroll/CompanyFinancialSetup.tsx`, `PayScheduleManager.tsx`, `PayrollBlockerBadge.tsx`, and `src/components/payroll/setup/` tree
- `src/components/finance/payroll/EmployerOnboardingPortal.tsx`, `RunW2PayrollDialog.tsx`, `W2PayrollHistoryCard.tsx`
- `src/components/finance/payroll/steps/StateTaxStep.tsx`, `MicroDepositVerifyStep.tsx` (and any other Gusto step files in that folder)
- `src/pages/PayrollSetup.tsx`
- `src/lib/w2-payroll.ts`
- `supabase/functions/run-w2-payroll/` (delete function)
- `src/components/driver/MyPaystubsDialog.tsx` gusto references stripped (driver pay view keeps working off `driver_payroll` only)

Update:
- `src/App.tsx`: drop `GustoAppProvider`; redirect `/payroll-setup` → `/finance/inhouse-payroll`; register new route
- `src/main.tsx`: drop provider import
- Sidebar/nav: remove "Payroll Setup" link, add "In-House Payroll" under Finance (owner + payroll_admin only)

## 2. Database migrations (single migration)
```
company_settings seed row: setting_key='ss_wage_base', setting_value='184500'
                          setting_key='tx_sui_rate',   setting_value='0.027'
                          setting_key='medicare_rate', setting_value='0.0145'
                          setting_key='ss_rate',       setting_value='0.062'

ALTER TABLE fleet_loads ADD COLUMN fsc_amount NUMERIC DEFAULT 0;

CREATE TABLE internal_payroll_ledger (
  id uuid pk, org_id uuid, driver_id uuid FK drivers,
  period_start date, period_end date,
  pay_model text,           -- 'percentage' | 'per_mile' | 'hourly' | 'salary'
  employment_type text,     -- 'w2' | '1099'
  total_miles numeric default 0,
  gross_line_haul numeric default 0,
  pass_through_fsc numeric default 0,
  gross_taxable_pay numeric default 0,
  federal_withholding_override numeric,   -- manual FIT override
  status text default 'draft',             -- 'draft' | 'finalized'
  finalized_at timestamptz, finalized_by uuid,
  created_at/updated_at, trigger update_updated_at
);

CREATE TABLE tax_withholding_ledger (
  id uuid pk, org_id uuid, ledger_id uuid FK internal_payroll_ledger ON DELETE CASCADE,
  ee_social_security numeric, er_social_security numeric,
  ee_medicare numeric, employer_medicare numeric,
  federal_income_withholding numeric,
  tx_twc_unemployment numeric,
  fl_reemployment numeric,
  created_at/updated_at
);

CREATE TABLE truist_payout_logs (
  id uuid pk, org_id uuid,
  ledger_id uuid FK internal_payroll_ledger,
  truist_ach_ref_code text,
  net_payout_amount numeric,
  marked_paid_at timestamptz default now(),
  processed_by uuid,
  created_at
);
```
For all three tables: GRANT to authenticated + service_role, enable RLS, policies scoped to `org_id = get_user_org_id(auth.uid())` AND `has_payroll_access(auth.uid())`. Add trigger to lock UPDATE/DELETE on rows where `status='finalized'` (raises 42501). Insert-only for `truist_payout_logs`; deleting/updating requires super_admin.

## 3. Tax engine (`src/utils/payCalculations.ts`)
Add exported types + functions (no breaking changes to existing exports):
- `loadPayrollTaxConfig(orgId)` — read the 4 `company_settings` rows, cache with react-query in a new `src/hooks/usePayrollTaxConfig.ts`.
- `calculateLineHaulBase({ grossTotal, fscAmount, payModel })` — for `percentage`, returns `grossTotal - fscAmount`; other models return `grossTotal`.
- `calculatePayrollTaxes({ grossTaxablePay, ytdEarnings, employmentType, config, federalOverride, state })`:
  - SS: `taxableWages = min(grossTaxablePay, max(0, config.ss_wage_base - ytdEarnings))`; EE = ER = `taxableWages * 0.062`.
  - Medicare: EE = ER = `grossTaxablePay * 0.0145` (no cap).
  - TX SUI: only when `employmentType='w2'` AND `state='TX'`: `grossTaxablePay * config.tx_sui_rate`.
  - FL reemployment: placeholder 0 unless `federalOverride.flRate` provided.
  - FIT: `federalOverride ?? 0` (manual entry only, per spec).
  - 1099 contractors: zero all EE/ER taxes.
- Unit tests appended to `src/utils/payCalculations.test.ts` covering: percentage FSC subtraction, SS cap crossover, 1099 zeroing, TX SUI gating.

## 4. UI (`src/components/finance/inhouse-payroll/`)
New page mounted at `/finance/inhouse-payroll` (owner + payroll_admin only via `has_payroll_access`):

- `InHousePayrollPage.tsx` — tabs: **Active Batch** · **Truist ACH Staging** · **Tax Filing Registry**
- `ActiveBatchTab.tsx`: period picker (defaults to current pay cycle from `payroll_settings`). "Generate Batch" button queries fleet_loads / driver_payroll for the window, upserts one draft `internal_payroll_ledger` row per driver with pass-through FSC pulled from `fleet_loads.fsc_amount`, and inserts matching `tax_withholding_ledger` row via the new engine using YTD sum from prior finalized ledgers. Table columns: Driver · Model · Gross · Pass-Through FSC · Gross Taxable · EE Taxes · ER Taxes · Net · Status. Inline "FIT Override" numeric input rewrites `federal_withholding_override` and recomputes.
- `TruistAchStagingTab.tsx`: lists draft ledgers with computed Net Payout. Each row: input "Truist ACH Entry Code" + "Finalize Settlement" button. Finalize inserts `truist_payout_logs` and sets ledger `status='finalized'`, `finalized_at=now()`, `finalized_by=auth.uid()`. Locked rows show a padlock + ACH code and cannot be edited.
- `TaxFilingRegistryTab.tsx`: static compliance calendar computed client-side from today:
  - Form 941 (quarterly W-2 payroll) due 4/30, 7/31, 10/31, 1/31
  - Form 940 (annual FUTA) due 1/31
  - 1099-NEC / W-2 to recipients due 1/31
  - TX TWC C-3 quarterly & FL RT-6 quarterly due last day of month after quarter close
  Rows color-code Overdue / Due-Soon (≤30d) / Upcoming. No writes.

Shared `src/hooks/useInternalPayrollLedger.ts` for queries/mutations; `useTruistPayoutLogs.ts` for staging table.

## 5. Driver-facing safety
- `src/components/drivers/` tree is not touched.
- `src/components/driver/MyPaystubsDialog.tsx` keeps reading from `driver_payroll` (existing legacy table) — Gusto imports removed only. No liability, tax, or FIT fields are ever exposed to drivers.
- Route guard: `/finance/inhouse-payroll` gated by `has_payroll_access`; drivers hitting it get redirected to `/driver`.

## Technical notes
- YTD calculation: `SUM(gross_taxable_pay)` from finalized ledgers where `driver_id=X AND date_part('year', period_end)=current_year`.
- FSC autopopulate: when generating a batch, `pass_through_fsc = SUM(fleet_loads.fsc_amount)` for delivered loads in the window belonging to the driver.
- All Supabase writes include `org_id` explicitly (RLS payload rule).
- Finalize trigger uses a `BEFORE UPDATE` guard checking `OLD.status='finalized'`.
- No `auth.users` FK on `finalized_by`/`processed_by` (per project convention).

## Out of scope
- No Truist API integration — ACH code is manual text entry only.
- No 1099 PDF generation (registry tracks deadlines only).
- No changes to existing `driver_payroll` / `driver_settlements` flows.
- No FL-specific rate storage yet (placeholder 0).
