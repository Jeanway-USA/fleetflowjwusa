
## Goal

Replace the separate "Bank Details" and "Tax Setup" steps on `/settings/payroll-setup` with a single unified component `CompanyFinancialSetup.tsx` that uses shadcn `Card` + `Tabs`, supports multiple state tax registrations, and includes bank micro-deposit verification.

## Files

**New**
- `src/components/payroll/CompanyFinancialSetup.tsx` — Card wrapper + two-tab layout ("Tax Configuration", "Bank Accounts"). Composes the two forms below.
- `src/components/payroll/setup/sections/StateTaxRow.tsx` — small helper for a single state row (state dropdown, withholding ID, SUI account #, SUI rate, remove button). Keeps the tax form readable.

**Edited**
- `src/services/gustoCompanyApi.ts` — extend `FederalTaxInput` with `legalName` (already present) + add:
  - `upsertStateTaxes({ states: StateTaxInput[] })` → calls new action `upsert_state_taxes`
  - `verifyBankAccount({ deposit1, deposit2 })` → calls new action `verify_bank_account`
- `supabase/functions/run-w2-payroll/index.ts` — add two handlers:
  - `upsert_state_taxes`: for each state, `PUT /v1/companies/{uuid}/state_taxes/{state}` with `{ state_tax: { ... } }` following Gusto's state-tax questions schema. Loops so it stays a single client call.
  - `verify_bank_account`: `PUT /v1/company_bank_accounts/{bank_account_uuid}/verify` with `{ deposit_1, deposit_2 }`. Resolves `bank_account_uuid` by first calling `GET /v1/companies/{uuid}/bank_accounts` and picking the most-recent unverified account.
- `src/pages/PayrollSetup.tsx` — replace the two step entries (`bank`, `tax`) with one step `financial` → `CompanyFinancialSetup`. Other steps (company, signatory, etc.) untouched.

## Tax Configuration tab

Single form managed with `react-hook-form` + zod.

- Federal section
  - Legal company name — text, default `"JeanWay LLC"`.
  - Federal EIN — masked `XX-XXXXXXX`, reused formatter from `TaxSetupSection`.
  - Filing form — select (`941` default, `944`).
  - Taxable as S-corp — switch.
- State Tax IDs section (repeatable rows via `useFieldArray`)
  - Row fields: State (select, US_STATES), Withholding account ID, SUI account #, SUI rate (%).
  - First row prefilled with `state: "TX"`.
  - "Add state" button appends a blank row; each row has a remove button (disabled when only one row remains).
  - Duplicate-state validation in zod (`superRefine`).
- Submit button `Save tax configuration`:
  1. `upsertFederalTaxDetails({ ein, legalName, filingForm, taxableAsScorp })`.
  2. On success, `upsertStateTaxes({ states })`.
  3. Success toast only when both return `ok: true`; otherwise show the specific error.

## Bank Accounts tab

- Bank details section — same shape as existing `BankDetailsSection` (accountHolder, accountType, routing, account, confirm). Wired to `createBankAccount`. Success toast on save; also stashes returned `bank_account_uuid` in local state (edge function already returns Gusto response — we'll pass it through) so the verification section can enable.
- Micro-deposit verification section (rendered below, in a bordered sub-card)
  - Two numeric inputs: "Deposit 1 ($)", "Deposit 2 ($)", each `0.01`–`0.99`, step `0.01`.
  - Disabled until a bank account has been saved this session OR the backend reports an existing unverified account.
  - Submit `Verify deposits` → `verifyBankAccount({ deposit1, deposit2 })`, success toast "Bank account verified" on 200/201.

## Endpoint mapping

| UI action | Edge action | Gusto endpoint |
|---|---|---|
| Save federal tax | `upsert_federal_tax_details` (existing) | `PUT /v1/companies/{uuid}/federal_tax_details` |
| Save state taxes | `upsert_state_taxes` (new) | `PUT /v1/companies/{uuid}/state_taxes/{state}` per row |
| Save bank | `create_bank_account` (existing) | `POST /v1/companies/{uuid}/bank_accounts` |
| Verify bank | `verify_bank_account` (new) | `PUT /v1/company_bank_accounts/{uuid}/verify` |

## Technical details

- Component styled with existing tokens (no hardcoded colors). Uses `Card`, `CardHeader`, `CardContent`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/*`.
- All Gusto tokens continue to live server-side in the edge function; client only calls `invokeWithAuth('run-w2-payroll', …)`.
- Success detection uses the existing `GustoApiResult.ok` pattern; toasts via `sonner`.
- Multi-state loop in the edge function short-circuits on first failure and returns `{ error, state }` so the UI can highlight the offending row.
- Page component (`PayrollSetup.tsx`) is the only mount point per the answer; the two old section files stay on disk (still imported by nothing) but I'll remove their imports from `PayrollSetup.tsx`.

## Out of scope

- Deleting the old `BankDetailsSection.tsx` / `TaxSetupSection.tsx` files (kept to avoid touching unrelated code; can be removed in a follow-up).
- Persisting bank/tax data to our own DB — remains Gusto-only, matching current behavior.
