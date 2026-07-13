## Problem

During onboarding, four structured PDFs (W-4, I-9, W-9, Direct Deposit) are generated with SSN / TIN / bank account numbers already masked (`***-**-0068`, `****6789`). Only one file is stored per document, so even the owner and payroll admin can never see the full digits from those signed forms — which they legally need for W-2 processing, 1099 filing, ACH setup, and tax filings.

The infrastructure for an unmasked admin copy already exists: `driver_signed_documents.admin_file_path` is a real column, `SignedOnboardingDocuments` already shows a **"Full copy"** button (owner + payroll_admin only), and other doc types populate it. The onboarding wizard just never writes one for these four forms.

## Fix (frontend only, in `src/pages/DriverOnboarding.tsx`)

Generate a second unmasked PDF at onboarding time and store its path in `admin_file_path`.

1. Extend `uploadFormPdf(docType, label, blob)` to also accept an optional `adminBlob`. When provided:
   - Upload it to `${orgId}/${driverRow.id}/${safe}-${ts}_admin.pdf` in the same `signed-documents` bucket.
   - Include `admin_file_path` in the `driver_signed_documents` insert (alongside `file_path`).

2. For each of the four affected forms, build a parallel "admin sections" array that uses the raw digits instead of `maskTail(...)`/`****last4`, generate a second PDF via `generateFormPdf`, and pass it as `adminBlob`:
   - **W-4** — replace `maskTail(w2Docs.w4_ssn)` with the full 9-digit SSN formatted `XXX-XX-XXXX`.
   - **I-9** — same treatment for `w2Docs.i9_ssn`.
   - **W-9** — replace `maskTail(contractorDocs.w9_tin)` with full TIN formatted per `tinType` (`XX-XXXXXXX` for EIN, `XXX-XX-XXXX` for SSN).
   - **Direct Deposit** — replace the `****last4` account with the full account number; routing number already shows in full so it stays.

3. Add a tiny local helper `formatSsn`/`formatTin` (or reuse the pattern from `useSensitiveDriverData.ts`) so the admin PDF is nicely formatted.

No changes to storage RLS, database schema, or the driver-facing masked PDF. The redacted `file_path` copy remains exactly as it is today — non-payroll roles (dispatcher, safety, driver themselves) still only ever see the masked version. Only owner and `payroll_admin` see the "Full copy" button that reveals the unmasked PDF.

## What the owner / payroll admin will see after this

On the driver profile → **Signed Onboarding Documents** section, for W-4, I-9, W-9, and Direct Deposit rows, the existing **Full copy** button will now appear and download an unmasked PDF containing the complete SSN / TIN / bank account number needed for payroll and tax filing.

## Files touched

- `src/pages/DriverOnboarding.tsx` — only file that needs edits.

## Out of scope

- No RLS/migration changes (columns and policies already exist).
- No changes to the redacted copies or to any other role's access.
- No changes to how SSN/TIN/banking are stored in the encrypted tables (`get_driver_ssn`, `get_driver_tin`, `get_driver_banking` RPCs continue to work exactly as they do).
