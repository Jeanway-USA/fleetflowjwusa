# Fix: Uncensored onboarding PDFs for payroll/tax use

## Problem

- Existing signed onboarding documents (W-4, I-9, W-9, Direct Deposit, and template-driven forms) were saved before admin PDFs were introduced, so `admin_file_path IS NULL` and the "Full copy" button never appears.
- The default "Preview" and "Download" buttons always fetch the masked `file_path`, so even owner/payroll_admin get censored data unless they notice the small secondary "Full copy" chip.
- Result: from your point of view, admin downloads still look censored.

## Fix (frontend only — no schema/RLS changes)

### 1. Owner/payroll_admin always get the unmasked PDF

In `src/components/drivers/SignedOnboardingDocuments.tsx`:

- When `canDownloadFull` is true (owner or payroll_admin):
  - "Preview" and "Download" resolve to `admin_file_path` when it exists, falling back to `file_path`.
  - If neither an `admin_file_path` nor an on-the-fly unmasked PDF is available, fall back to `file_path` (still the masked copy) so nothing breaks.
- Remove the redundant "Full copy" button now that Preview/Download already return the unmasked artifact for privileged roles.
- Non-privileged roles (safety, etc.) keep seeing the masked `file_path` — unchanged.

### 2. On-demand unmasked PDF for historical docs

For documents whose `admin_file_path` is null (everything signed before the previous fix), add a per-row "Regenerate unmasked PDF" action visible only to `canDownloadFull`. It generates the PDF client-side from the authoritative DB tables and downloads it directly (no upload, no schema write).

New helper `src/lib/onboarding/regenerateAdminPdf.ts`:

- Input: `{ driverId, documentType }`.
- Reads driver identity from `drivers` (name, address on file).
- For each supported `document_type`, queries the corresponding table over RLS (owner/payroll_admin only):
  - `w4` → `driver_w4_info` + `drivers`
  - `i9` → `driver_i9_info`
  - `w9` → `driver_w9_info`
  - `direct_deposit`, `direct_deposit_form` → `driver_banking_info` (via existing `get_driver_banking` RPC if present, otherwise direct select) — uses full account/routing numbers
  - Template-based docs with `ssn`/`account_number` tokens → re-render `generateSignedPdf({ ...args, redact: false })` using `driver_w4_info.ssn` / `driver_banking_info.account_number` as the source of truth
- Builds the PDF using the existing `generateFormPdf` / `generateSignedPdf` helpers with the same `fullSsn`/`fullTin`/`fullAccount` formatters already in `DriverOnboarding.tsx` (extract them into `src/lib/onboarding/mask.ts` and reuse from both files).
- Triggers a browser download; nothing is written to storage or the DB.

### 3. Keep the write-time admin copy for new signings

The existing write path in `src/pages/DriverOnboarding.tsx` already stores an unmasked PDF at `admin_file_path` for W-4/I-9/W-9/Direct Deposit and for the template-based direct deposit form. No changes required there — the new UI just consumes that file when it exists and falls back to the regeneration helper when it does not.

## Files touched

- `src/components/drivers/SignedOnboardingDocuments.tsx` — reroute Preview/Download to `admin_file_path` for privileged roles; add "Regenerate unmasked PDF" action for rows without one; drop the "Full copy" chip.
- `src/lib/onboarding/mask.ts` (new) — extract `fullSsn`, `fullTin`, `fullAccount` from `DriverOnboarding.tsx` for reuse.
- `src/pages/DriverOnboarding.tsx` — swap local helpers for the shared `mask.ts` exports (no behavior change).
- `src/lib/onboarding/regenerateAdminPdf.ts` (new) — assembles unmasked PDFs for historical documents from `driver_w4_info` / `driver_i9_info` / `driver_w9_info` / `driver_banking_info`.

## Out of scope

- No RLS/schema/migration changes. Access is already restricted to owner/payroll_admin/safety by existing policies on `driver_signed_documents` and the source tables.
- Non-privileged roles continue to see the masked PDF exactly as before.
- No changes to storage bucket policies or edge functions.
