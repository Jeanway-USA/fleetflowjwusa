## Wire Payroll Setup Forms to Gusto via Edge Function

Reference: the four sections are in `src/components/payroll/setup/sections/`. `GustoCompanySetup.tsx` isn't a real file — the plan targets the actual section components. Also: browser code cannot call `api.gusto.com` directly without leaking the bearer, so the client service will call the existing `run-w2-payroll` edge function which already mints/refreshes Gusto tokens server-side using `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET` env vars.

### 1. New edge-function actions in `supabase/functions/run-w2-payroll/index.ts`

Add four action handlers that use the existing `gustoFetch(admin, orgId, path, init)` helper (already injects `Authorization: Bearer <token>` + `X-Gusto-API-Version` server-side). Each pulls `companyUuid` from `getAccessToken(admin, orgId)` and 409s if the company hasn't been provisioned yet.

- `upsert_signatory` → `POST /v1/companies/{company_uuid}/signatories`
  Payload: `{ first_name, last_name, title, birthday: 'YYYY-MM-DD', ssn: '#########' }` (strip dashes server-side).
- `upsert_primary_location` → `PUT /v1/companies/{company_uuid}/locations`
  Payload: `{ street_1, street_2?, city, state, zip, country: 'USA', phone_number?, mailing_address: true, filing_address: true }`. Also send `{ industry: { naics_code } }` in the same action via a second `PUT /v1/companies/{company_uuid}` call so Company & Industry is one round trip.
- `create_bank_account` → `POST /v1/companies/{company_uuid}/bank_accounts`
  Payload: `{ routing_number, account_number, account_type: 'Checking' | 'Savings', account_holder_name }`.
- `upsert_federal_tax_details` → `PUT /v1/companies/{company_uuid}/federal_tax_details`
  Payload: `{ ein, filing_form: '941', taxable_as_scorp: false, legal_name }` (uses the values from the Tax Setup form; extra state-tax IDs are stored in a `TODO` note — Gusto exposes those via a separate `state_taxes` endpoint we'll add in a follow-up).

Each handler returns `{ ok: true, gusto: <parsed body> }` on 2xx; on non-2xx it throws with the Gusto error body so the top-level catch returns 500 with `{ error }`.

Add the four cases to the `switch (action)` block right after `push_payroll_inputs`.

### 2. New client service `src/services/gustoCompanyApi.ts`

Thin, typed wrapper around `invokeWithAuth('run-w2-payroll', { body: { action, payload } })`. Exports:

```ts
export interface SignatoryInput { firstName; lastName; title; dateOfBirth: Date; ssn }
export interface CompanyLocationInput { legalName; street1; street2?; city; state; zip; industryCode }
export interface BankAccountInput { accountHolder; accountType: 'checking'|'savings'; routingNumber; accountNumber }
export interface FederalTaxInput { ein; legalName }

export async function upsertSignatory(input: SignatoryInput): Promise<GustoApiResult>
export async function upsertPrimaryLocation(input: CompanyLocationInput): Promise<GustoApiResult>
export async function createBankAccount(input: BankAccountInput): Promise<GustoApiResult>
export async function upsertFederalTaxDetails(input: FederalTaxInput): Promise<GustoApiResult>
```

Each function:
- Formats the payload to Gusto's snake_case shape (`birthday` from `format(date, 'yyyy-MM-dd')`, SSN/EIN stripped of dashes, account type Title-cased, etc.).
- Calls `invokeWithAuth`; treats any successful non-error response as 200/201 success (the edge function only returns 2xx on Gusto 2xx).
- Returns `{ ok: boolean; data?: unknown; error?: string }` so components stay UI-focused.

No bearer tokens in the file — the edge function reads `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET` from Supabase secrets and mints/refreshes access tokens server-side. Confirm both secrets already exist via `fetch_secrets` before shipping; if either is missing, ask the user before wiring further.

### 3. Wire the four form submits

In each section, replace the stub `console.log + toast` in `onSubmit` with:

```ts
setSubmitting(true);
const res = await upsertX(values);
setSubmitting(false);
if (res.ok) toast.success('<Section> saved', { description: 'Synced to Gusto.' });
else toast.error('Failed to save', { description: res.error ?? 'Please try again.' });
```

Use `form.formState.isSubmitting` (already wired) via `await form.handleSubmit(async …)` — no extra state needed. Submit buttons already exist and remain disabled while submitting.

Sections touched:
- `SignatorySection.tsx` → `upsertSignatory`
- `CompanyIndustrySection.tsx` → `upsertPrimaryLocation` (combined address + industry)
- `BankDetailsSection.tsx` → `createBankAccount`
- `TaxSetupSection.tsx` → `upsertFederalTaxDetails` (state-tax fields kept in the form but not sent this turn — TODO comment references the follow-up `state_taxes` endpoint)

### Files touched

- `supabase/functions/run-w2-payroll/index.ts` (add 4 actions + 4 switch cases)
- `src/services/gustoCompanyApi.ts` (new)
- `src/components/payroll/setup/sections/SignatorySection.tsx` (submit handler)
- `src/components/payroll/setup/sections/CompanyIndustrySection.tsx` (submit handler)
- `src/components/payroll/setup/sections/BankDetailsSection.tsx` (submit handler)
- `src/components/payroll/setup/sections/TaxSetupSection.tsx` (submit handler)

### Out of scope this turn

- No new secrets requested (reusing existing `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET`).
- No state-tax `state_taxes` endpoint wiring (follow-up).
- Payroll Setup blocker-count badge still shows `—` (recomputing it needs a separate Gusto onboarding-status parse).
