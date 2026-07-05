## White-labeled W-2 Payroll Compliance Engine

This is a large scope, so I've split it into 5 phases that each land as an independently reviewable slice. Nothing here breaks the existing dispatcher, IOO, or settlements flows — everything is additive and gated on `employment_type = 'w2_company'` and `gusto_company_integrations.onboarding_status`.

I'll implement Phase 1 → 5 in that order in follow-up turns. If you want to reorder or drop a phase, tell me before I start Phase 1.

---

### Phase 1 — Schema & ledger upgrades (single migration)

Extend the existing tables (no new tables required; the current schema already has `gusto_company_integrations` and `drivers.gusto_employee_id`).

`public.gusto_company_integrations` — add:
- `onboarding_steps jsonb` — cached copy of Gusto's `GET /v1/companies/{uuid}/onboarding_status` step list.
- `onboarding_steps_synced_at timestamptz`.
- `bank_account_uuid text`, `bank_verification_status text` (`unverified` / `awaiting_deposits` / `verified` / `failed`), `bank_verification_attempts int default 0`.
- `active_pay_schedule_uuid text`, `pay_schedule_frequency text`.
- `federal_tax_status text`, `signatory_status text`.
- `state_tax_requirements jsonb` — keyed by 2-char state, holds the raw Gusto tax_requirements payload + `last_synced_at`.

`public.drivers` — add:
- `tax_state char(2)` (work state; distinct from `home_state`).
- `assigned_work_address_id text` (Gusto location uuid).
- `onboarding_status text default 'not_started'` (mirrors Gusto's employee onboarding_status enum).
- `gusto_employee_id` already exists — no change.

No RLS changes: both tables already have policies. Migration only adds columns + backfills `tax_state` from `home_state` where possible.

---

### Phase 2 — Provisioning + Step 1/2 proxy actions in `run-w2-payroll`

Reuse the existing edge function (all Gusto calls stay server-side; browser never sees the bearer). Add these actions, each org-scoped through the existing `has_payroll_access` guard:

- `provision_partner_managed_company` — already exists as `provision_company`; extend to accept `{ legal_name, trade_name, ein, contact_email, tos_accepted_ip }` and persist onboarding_status = `provisioned`.
- `accept_terms_of_service` — POST `/v1/companies/{uuid}/accept_terms_of_service` with the acknowledging user's IP + name; stores `tos_accepted_at` on the integration row.
- `set_industry` — PUT `/v1/companies/{uuid}/industry_selection` with a NAICS/SIC pair.
- `upsert_federal_tax_details` — already exists; extend payload to accept CP-575 legal name + filing form.
- `sync_onboarding_steps` — GET `/v1/companies/{uuid}/onboarding_status`, cache into `gusto_company_integrations.onboarding_steps`.
- `get_state_tax_requirements` — GET `/v1/companies/{uuid}/tax_requirements/{state}`; cache in `state_tax_requirements`.
- `submit_state_tax_requirements` — PUT the same path with the field values the admin filled in.
- `create_bank_account_from_plaid` — POST `/v1/companies/{uuid}/bank_accounts` with a Plaid processor token (falls back to routing/account if not provided).
- `initiate_micro_deposits` and `verify_micro_deposits` — corresponding Gusto endpoints; update `bank_verification_status`.
- `create_pay_schedule` + `assign_employee_pay_schedule` — already exist; add `list_pay_schedules` (GET) so the UI can show the active one.
- `create_employee_self_onboarding_flow_token` — thin wrapper around the existing flow-token endpoint scoped to `employee_self_management` for the target employee.

No config.toml changes; function still deploys with the current `verify_jwt` posture and validates JWTs in code.

---

### Phase 3 — Embedded employer tax & bank onboarding portal

New folder `src/components/finance/payroll/` (as requested — mirrors the finance module layout):

- `EmployerOnboardingPortal.tsx` — top-level card with a `Stepper` that reads from `onboarding_steps` (Phase 1 cache) and shows completion state per step.
- `steps/CompanyDetailsStep.tsx` — legal name, EIN, NAICS picker, ToS checkbox → `set_industry` + `accept_terms_of_service`.
- `steps/FederalTaxStep.tsx` — CP-575 mapping form → `upsert_federal_tax_details`.
- `steps/StateTaxStep.tsx` — driven by driver `tax_state` distinct values. For each state it calls `get_state_tax_requirements` and dynamically renders Gusto's declared fields (account IDs, deposit schedules, SUI rates). Submits via `submit_state_tax_requirements`.
- `steps/BankAccountStep.tsx` — two paths:
  1. **Plaid** — uses the existing Plaid Link (if a Plaid public key secret is present) → exchanges for a processor token in a new edge action, then `create_bank_account_from_plaid`.
  2. **Manual + micro-deposits** — routing/account input → `initiate_micro_deposits` → later `verify_micro_deposits` with the two deposit amounts.
- `steps/PayScheduleStep.tsx` — reuses the existing `PayScheduleManager` (already built).
- `steps/SignatoryStep.tsx` — reuses the existing `SignatorySection`.
- Where Gusto provides a hosted React flow (via `@gusto/embedded-react-sdk`), the step uses it inside a `<GustoAppProvider>` (already present) with a short-lived flow token generated by `create_flow_token`. Fallback custom forms cover cases where a flow isn't provided.

Mounts inside `Settings → Payroll` above the existing `W2DriverSyncDashboard` and `PayScheduleManager`.

**Plaid note**: If you want the Plaid path, I'll need a `PLAID_CLIENT_ID` + `PLAID_SECRET`. Until those are added, the Bank step falls back to manual routing/account + micro-deposit verification.

---

### Phase 4 — Driver self-onboarding & e-sign

- `src/pages/DriverOnboarding.tsx` — add a branch for W-2 drivers:
  - When an admin creates a W-2 driver profile, the existing `sync_employee` action now also sends `self_onboarding: true`, work_address, compensation rate, and tax_state.
  - New `W2SelfOnboardingCard` inside the driver portal that fetches a `create_employee_self_onboarding_flow_token` and renders Gusto's `employee_self_management` flow via the Embedded React SDK (already installed) so the driver completes PII, W-4, direct deposit, and federal + state e-sign entirely inside FleetFlow.
- Driver `onboarding_status` (Phase 1) is refreshed via the existing `get_employees_onboarding_status` action after the flow closes.
- IOO drivers see the existing 1099 contractor path unchanged.

---

### Phase 5 — Run Payroll white-label frame

- `RunW2PayrollDialog.tsx` — replace the current placeholder body with an embedded Gusto Run Payroll flow:
  - Calls `create_flow_token` with `flow_type: 'payroll'` and `entity_type: 'Company'` at open time (token is short-lived, minted per open).
  - Renders the Gusto React SDK's Run Payroll component inside the dialog with our theme applied (existing `src/lib/gusto/theme.ts`).
  - Pre-populates payroll inputs from the current settlement period via the already-implemented `push_payroll_inputs` action, so Landstar statement gross wages, fuel card corrections, and deductions flow into Gusto's calculator before Timothy hits Submit.
- Post-submit hook: refresh `W2PayrollHistoryCard` and mark associated `driver_settlements` rows with the Gusto payroll uuid for reconciliation. Gusto handles direct deposit funding, 941, and SUTA filing automatically once the payroll is submitted — no additional code required.

---

### Explicitly NOT doing
- No changes to IOO settlements, factoring, or IFTA flows.
- No custom tax-calculation logic — every dollar of federal / state / local tax and every filing (941, SUTA, W-2, W-3, new-hire reports) is delegated to Gusto.
- No new `payroll_settings` columns — that table already covers what we need.
- No hosted Plaid Link UI beyond a thin wrapper unless you confirm Plaid credentials.

### Prerequisites I'll need from you before Phase 3 lands
1. Confirm whether Bank Account onboarding should support Plaid (needs `PLAID_CLIENT_ID` / `PLAID_SECRET`) or micro-deposits only for now.
2. Confirm the NAICS default for trucking (`484121` "General Freight, Long-Distance, Truckload") is acceptable, or provide a different default.

Reply "go" (or specify a phase to start with) and I'll begin Phase 1's migration.
