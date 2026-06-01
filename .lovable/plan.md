# Fix: Banking info not syncing from onboarding to driver profile

## Root cause

Verified against the database: of all drivers, **zero** rows in `driver_banking_info` and **zero** drivers with `direct_deposit_attachment_url` set — even though several `direct_deposit` signed documents were uploaded successfully (with valid `attachment_file_path` values).

In `src/pages/DriverOnboarding.tsx` (lines 327–355), after a `direct_deposit` template is signed, the code does two things in order:

1. `UPDATE drivers SET direct_deposit_attachment_url = ...` for the current driver
2. `rpc('upsert_driver_banking', ...)` to encrypt + store the routing/account numbers

Step 1 fails because of the existing trigger `prevent_driver_self_sensitive_update`, whose forbidden-column list includes `direct_deposit_attachment_url`. The driver is signing in as themselves during onboarding, so the trigger raises `42501` (`Drivers are not permitted to modify ... assignment fields`). The code then `throw`s that error, which short-circuits the function before step 2 — so banking info never reaches `driver_banking_info` and `DriverBankingDetails.tsx` correctly shows "No banking info on file yet."

`direct_deposit_attachment_url` is data the driver themselves provides during onboarding (their own voided check / DD form), not a sensitive admin-managed field like `pay_rate` or `status`, so the trigger should not block it.

## Changes

### 1. Database migration — relax the self-update trigger

Recreate `public.prevent_driver_self_sensitive_update` with `direct_deposit_attachment_url` removed from the forbidden-column comparison. All other forbidden fields (`pay_rate`, `pay_type`, `status`, `hire_date`, `user_id`, `org_id`, `first_name`, `last_name`, `avatar_url`) stay blocked. No schema change, no data backfill.

### 2. `src/pages/DriverOnboarding.tsx` — make banking save resilient

In `finalizeSubmission`, inside the `if (tmpl.document_type === 'direct_deposit')` block:

- Wrap the `drivers` update so a failure surfaces via `toast.error(...)` and `console.error(...)` but does **not** `throw`, so the subsequent `upsert_driver_banking` RPC still runs (defense in depth — if any other RLS/trigger ever rejects the column, we still capture the encrypted banking data).
- Leave the banking RPC error handling as-is (already toasts + logs without throwing).

No UI changes to `DriverBankingDetails.tsx` are required; once the data lands in `driver_banking_info` and `drivers.direct_deposit_attachment_url`, that component already renders bank name, account type, masked last 4, the Reveal button (decrypted via `get_driver_banking`), and the signed attachment preview.

## Out of scope

- No retro backfill of past onboardings (the encrypted account/routing numbers were never persisted and cannot be reconstructed). Affected drivers will need to re-enter their banking details, or an admin can fill them in via the existing edit flow.
- No changes to the encryption or `get_driver_banking` decrypt path — those already work and remain owner/payroll-only.
