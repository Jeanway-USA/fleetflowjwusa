## Goal

Refactor the existing W-2 payroll module to route through **Gusto Embedded Payroll (sandbox)** using a partner-managed provisioning model and the official `@gusto/embedded-react-sdk`. Our edge function becomes a secure proxy that mints flow tokens and syncs employees/payroll inputs; the UI dialogs host Gusto's white-labeled flows.

## Environment & Secrets

- Base URL: `https://api.gusto-demo.com` (sandbox). Stored as `GUSTO_API_BASE_URL` so prod is a one-secret swap.
- New runtime secrets requested via `add_secret` after the plan is approved:
  - `GUSTO_CLIENT_ID`
  - `GUSTO_CLIENT_SECRET`
  - `GUSTO_PARTNER_ACCESS_TOKEN` (system-level token for company provisioning)
- No frontend secrets. All Gusto API calls originate from the edge function.

## 1. Database migration

Two changes in one migration:

**`public.drivers`** — add nullable column:
- `gusto_employee_id text` (unique per org via partial index where not null)

**`public.gusto_integration`** — one row per org:
- `org_id uuid` (PK, FK → organizations)
- `gusto_company_uuid text`
- `access_token_encrypted bytea` (pgp_sym_encrypt via existing `internal_config.banking_encryption_key` pattern)
- `refresh_token_encrypted bytea`
- `token_expires_at timestamptz`
- `onboarding_status text` (`pending` | `provisioned` | `active` | `error`)
- `last_synced_at timestamptz`, `created_at`, `updated_at`

Full RLS lock-down:
- `GRANT SELECT ON public.gusto_integration TO authenticated;` (read-only for UI status badges)
- `GRANT ALL ON public.gusto_integration TO service_role;` (edge function writes)
- Policies: only `is_owner(auth.uid())` or `has_role(auth.uid(),'payroll_admin')` may SELECT rows where `org_id = get_user_org_id(auth.uid())`. No client INSERT/UPDATE/DELETE.
- Security-definer helpers `gusto_get_tokens(_org_id)` and `gusto_set_tokens(...)` so only the edge function (via service_role) touches ciphertext.
- Update trigger for `updated_at`.

## 2. Edge function refactor — `supabase/functions/run-w2-payroll/index.ts`

Convert the current single-purpose function into an authenticated action router (`{ action, payload }` in body). Every action calls `getClaims()` then checks `is_owner` / `payroll_admin` via a service-role client scoped to the caller's org.

Actions:
- `provision_company` — POST partner token to `/v1/partner_managed_companies`; store returned `company_uuid` + tokens (encrypted) in `gusto_integration`.
- `sync_employee` — upsert a driver into Gusto: create employee, add home address, job, compensation; write `gusto_employee_id` back to `drivers`.
- `create_flow_token` — POST `/v1/companies/{uuid}/flows` with a `flow_type` param (`payroll_run`, `paystubs`, etc.) and return the short-lived flow URL + token to the client.
- `push_payroll_inputs` — accept a Landstar settlement batch, map via `src/lib/w2-payroll.ts` shared types, POST to `/v1/companies/{uuid}/payrolls/{id}/employee_compensations`.
- `refresh_token` — internal helper: if `token_expires_at < now()+60s`, POST to `/oauth/token` with `refresh_token` grant, re-encrypt and store.

Shared helpers inside the function:
- `getGustoAccessToken(orgId)` — decrypt → refresh if needed → return bearer.
- `gustoFetch(orgId, path, init)` — wraps fetch with auth, 401 retry after forced refresh, and structured error mapping.
- CORS via `npm:@supabase/supabase-js@2/cors` (no local `corsHeaders` const).
- Zod validation on every action payload.

## 3. Data mapping — `src/lib/w2-payroll.ts`

Keep the existing Landstar settlement parsing exports. Add:
- Types `GustoEmployeeInput`, `GustoCompensationInput`, `GustoPayrollInputRecord` that mirror Gusto's schema (fixed / regular / overtime / bonus / reimbursement earnings, hours, memo).
- `mapDriverToGustoEmployee(driver, w4)` — normalizes name, SSN, address, filing status.
- `mapSettlementToGustoPayrollInputs(settlement, driver)` — turns each line item into a Gusto compensation record (regular pay → `regular_hours` × rate or fixed amount; reimbursements/deductions → their Gusto counterparts; bonuses → `bonus`).
- `summarizeGustoPayrollBatch(inputs)` — client-side totals for the confirmation screen.

Pure functions, no fetch calls; consumed by both the edge function (via a shared import) and the UI dialog for preview.

## 4. `RunW2PayrollDialog.tsx` refactor

- Add `bun add @gusto/embedded-react-sdk` (see stack note below).
- New top-level `<GustoProvider>` wired in `App.tsx` reads `VITE_SUPABASE_URL` and forwards a fetcher that hits our edge function's `create_flow_token` action, so the SDK never sees Gusto directly.
- Dialog flow:
  1. On open, call `run-w2-payroll` action `create_flow_token` with `flow_type: 'payroll_run'` and the current pay period.
  2. Render `<PayrollFlow flowToken={...} theme={gustoDarkTheme} onComplete={...} onError={...}/>` inside the existing dialog shell.
  3. Preview panel (left column) still shows our local `summarizeGustoPayrollBatch` totals so owners see FleetFlow's read of the Landstar settlement before submitting inside Gusto.
  4. `onComplete` triggers a `push_payroll_inputs` call (final commit) and closes the dialog with a toast.
- Theme mapping: build `gustoDarkTheme` from our existing `--background`, `--foreground`, `--primary`, `--muted` HSL tokens so the embedded frame matches FleetFlow.

## 5. `MyPaystubsDialog.tsx` refactor

- Same provider is already global, so the dialog just:
  1. Calls `create_flow_token` with `flow_type: 'paystubs'` and the driver's `gusto_employee_id` (looked up server-side from `auth.uid()` — never trusted from the client).
  2. Renders `<PaystubsFlow flowToken={...} theme={gustoDarkTheme} />` full-height inside the dialog body.
  3. Loading + error states use existing `Skeleton` and `Alert` primitives.
- If the current driver has no `gusto_employee_id` yet, show a friendly "Payroll not yet activated for your account" state instead of mounting the SDK.

## Files touched

- `supabase/migrations/<timestamp>_gusto_embedded.sql` (new)
- `supabase/functions/run-w2-payroll/index.ts` (rewrite)
- `src/lib/w2-payroll.ts` (extend)
- `src/components/finance/payroll/RunW2PayrollDialog.tsx` (rewrite render body)
- `src/components/driver/MyPaystubsDialog.tsx` (rewrite render body)
- `src/App.tsx` (wrap tree in `<GustoProvider>`)
- `package.json` / lockfile (via `bun add @gusto/embedded-react-sdk`)

## Out of scope (call out for a follow-up)

- Real Gusto webhook receiver (`/functions/v1/gusto-webhooks`) for payroll status callbacks.
- OAuth Connect flow — not needed under the partner-managed choice.
- Production credentials + Gusto's go-live checklist.
- Migrating historical FleetFlow paystubs into Gusto.

## Open dependency risk

`@gusto/embedded-react-sdk` is a partner-gated npm package. If the workspace's npm registry can't pull it (401), we'll need a workspace **Build Secret** (`NPM_TOKEN` or `PACKAGES_TOKEN`) plus an `.npmrc` — I'll flag this the moment `bun add` fails and pause for you to add the token in Workspace Settings → Build Secrets before continuing.