## Problem

Each onboarding section (Company & Industry, Signatory, Federal Tax, Bank, State Tax, Pay Schedule) submits data to Gusto via `run-w2-payroll`, but the forms never read the saved values back. When a step is marked "Done" by `sync_onboarding_steps` and the user re-opens the accordion, the form shows its hardcoded `defaultValues` (mostly empty), so it looks like nothing was saved.

The data is actually stored in Gusto — it's just never rehydrated into the form.

## Fix

Add read-side endpoints to the edge function and use them to prefill each section's form.

### 1. `supabase/functions/run-w2-payroll/index.ts`

Add new actions that GET data from Gusto and return it to the client:

- `get_company` — returns legal name, primary work address, phone, NAICS industry code
- `get_signatory` — returns signatory first/last name, title, email, phone, home address (SSN/DOB not returned by Gusto once saved; leave blank)
- `get_federal_tax_details` — returns EIN, filing_form, taxable_as_scorp
- `list_bank_accounts` — returns existing bank account uuid + last4 + verification status
- `list_state_tax_setups` — returns per-state withholding/SUI account ids + rate

Wire each into the `switch (action)` block.

### 2. `src/services/gustoCompanyApi.ts`

Add typed client wrappers (`getCompany`, `getSignatory`, `getFederalTaxDetails`, `listBankAccounts`, `listStateTaxSetups`) that call the new actions via `callAction`.

### 3. Section components

For each section under `src/components/payroll/setup/sections/` and `src/components/finance/payroll/steps/`:

- Fetch current values with `useQuery` on mount, keyed by `orgId`.
- Pass fetched values into `useForm`'s `defaultValues`, plus `form.reset(values)` in a `useEffect` when the query resolves (so switching orgs or refetching also rehydrates).
- Show a small "Loading…" state while fetching.
- Keep the existing submit flow unchanged; after a successful save, invalidate the section's query so the newly saved values re-load.

Affected files:
- `sections/CompanyIndustrySection.tsx`
- `sections/SignatorySection.tsx` (SSN/DOB stay input-only; other fields prefill)
- `sections/TaxSetupSection.tsx`
- `steps/MicroDepositVerifyStep.tsx` (prefill bank account uuid + show masked last4)
- `steps/StateTaxStep.tsx`
- `PayScheduleManager.tsx` (already lists pay schedules; verify it reflects saved schedule and skip if it already does)

### 4. Portal refresh

In `EmployerOnboardingPortal.tsx`, on successful save inside any section, also `refetch()` the `gusto-onboarding-steps` query so the "Done" badge updates in the same interaction.

## Out of scope

- No schema changes. All state lives in Gusto; we only read/write through the edge function.
- Sensitive fields Gusto never returns (SSN, DOB, full bank account number) stay blank on rehydrate by design.
