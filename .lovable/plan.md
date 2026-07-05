## Problem
The Tax Setup form only submits the EIN via `upsertFederalTaxDetails`. The Primary filing state, SUI account number, SUI rate, and (when applicable) State withholding account ID are validated in the form but never sent to Gusto — so nothing "state-side" saves.

## Fix (frontend only — `TaxSetupSection.tsx`)

1. **Import `upsertStateTaxes`** from `@/services/gustoCompanyApi` (wrapper already exists).

2. **In `onSubmit`, after the federal call succeeds**, call `upsertStateTaxes` with:
   ```ts
   {
     states: [{
       state: values.filingState,
       withholding_account_id: stateRequiresWithholding
         ? values.stateAccountId.trim()
         : '',
       sui_account_id: values.suiAccountId.trim(),
       sui_rate: values.suiRate,
     }]
   }
   ```
   (For no-SIT states like TX, send an empty `withholding_account_id`; Gusto's state_taxes endpoint accepts state-specific field sets.)

3. **Sequence & error handling**
   - If federal call fails → toast error, stop.
   - If federal succeeds but state call fails → toast: "Federal saved, but state details failed: {error}". Still invalidate `gusto-federal-tax`.
   - Only show the green "Tax setup saved" toast when both calls succeed.

4. **Query invalidation** — on full success, invalidate `['gusto-federal-tax']`, `['gusto-state-taxes']` (harmless if unused), and `['gusto-onboarding-steps']` so the Pending → Done badge updates.

5. **Disable submit** while either mutation is in-flight (track via local `isSaving` state around the async submit).

## Out of scope
- No changes to the edge function; `upsert_state_taxes` action already exists at line 1527 and hits `/v1/companies/{uuid}/state_taxes/{state}`.
- No schema changes.
- Rehydration of saved state-tax values back into the form is a separate follow-up (would need a new `list_state_taxes` action).
