## Root cause
`PUT /v1/companies/{uuid}/state_taxes/{state}` is deprecated. Current Gusto API uses a "company state taxes" resource with a questions/answers structure:

- `GET /v1/companies/{company_uuid}/company_state_taxes` — returns array of state objects, each with `uuid`, `state`, `version`, and `questions: [{ key, answers: [{ valid_from, value }] }]`.
- `PUT /v1/company_state_taxes/{state_tax_uuid}` with body `{ version, states: [{ questions: [...] }] }` — or per-endpoint variant.

For TX, the state has SUI questions only (no withholding). For SIT states, both categories exist.

## Fix (edge function only — `supabase/functions/run-w2-payroll/index.ts`)

Rewrite `actionUpsertStateTaxes` (lines ~670–708):

1. `GET /v1/companies/{companyUuid}/company_state_taxes` → find entry where `state === payload.state`.
2. Read its `uuid`, `version`, and `questions`.
3. For each incoming field, find the matching question by well-known `key`:
   - SUI account number → key contains `account_number` (e.g. `tx_sui_account_number`, `<state>_employer_account_number`).
   - SUI rate → key contains `unemployment` and `rate` (e.g. `tx_sui_rate`).
   - Withholding account ID → key contains `withholding` and `account_number`.
   Match case-insensitively; skip when no matching question exists (e.g. no withholding question for TX).
4. Build `answers: [{ valid_from: '2025-01-01', value: <string> }]` for each matched question, preserving existing `answers` for unmatched questions.
5. `PUT /v1/company_state_taxes/{state_tax_uuid}` with `{ version, states: [{ questions: [...] }] }`. Include `version` for optimistic concurrency.
6. Return `{ ok: true, gusto: body }`.

Also add small helpers `findQuestion(questions, ...predicates)` and `setAnswer(question, value)` for readability. Keep the outer loop over `payload.states`.

## No frontend changes
The client already sends `{ state, withholding_account_id, sui_account_id, sui_rate }`. Sending an empty `withholding_account_id` for TX is fine — the mapper simply won't find a matching withholding question and skips it.

## Verification
- After deploy, save Tax Setup with TX → expect 200 from `upsert_state_taxes` and Gusto onboarding step `state_setup` to flip.
- Switch to a SIT state (e.g. CA) → the withholding field becomes required, and both SUI + withholding questions get updated.

## Out of scope
- Hydrating existing saved state answers back into the form (separate follow-up).
- Effective-date UI — hard-code `valid_from` to the current calendar year's Jan 1.
