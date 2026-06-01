## Why banking info is blank today

The driver profile's banking card reads from `driver_banking_info`, but that table has **zero rows** for all 3 current drivers — even though they signed the Direct Deposit form. The onboarding flow calls `upsert_driver_banking` only inside the same submit loop that writes signed PDFs, and any RPC failure is swallowed into a toast and never retried. The raw bank values entered during onboarding are not stored anywhere else (the PDF embeds them visually, but they're not in `driver_signed_documents`), so there's no automatic way to recover the existing drivers' details without asking them again.

## Fix in two parts

### 1. Let the admin enter banking once on the driver profile (no driver re-onboarding)

Add an inline "Edit banking" editor inside `DriverBankingDetails` that owners / payroll admins can use to type in bank name, account type, routing #, and account #. It saves through the existing `upsert_driver_banking` RPC (already supports owner/payroll role). After save, the card refreshes and shows the new metadata + last-4. This unblocks the 3 current drivers — the owner can fill it in for them from a voided check or their existing signed PDF without re-running onboarding.

- Adds: edit/save/cancel buttons next to the existing Reveal button
- Validates: routing = 9 digits, account ≥ 4 digits, type = checking/savings
- On success: invalidates `driver_banking` and `driver_banking_meta` queries

### 2. Stop the silent failure on future onboardings

Harden `DriverOnboarding.tsx` so the banking step can't quietly fail:

- If `upsert_driver_banking` returns an error, **abort the submit** (throw) instead of just toasting and moving on, so the driver sees the real error and the admin gets a chance to retry.
- Log the error payload to the console with the driver id and a clear prefix so we can diagnose if it recurs.
- Same treatment for the `drivers.direct_deposit_attachment_url` update (only block when an attachment was expected).

No DB migration is required — `upsert_driver_banking` and RLS are already correct, and the encryption key is in place.

## Files touched

- `src/components/drivers/DriverBankingDetails.tsx` — add admin edit form + mutation
- `src/pages/DriverOnboarding.tsx` — fail loudly on banking RPC errors

## Out of scope

- No changes to the encryption scheme, RLS, or the `direct_deposit` template itself.
- No automated PDF-text extraction to backfill the 3 existing drivers — owner enters them manually from the existing signed forms once.
