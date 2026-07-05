## Problem (confirmed)

`src/components/onboarding/DocumentSignatureStep.tsx` owns `w2Docs` (`W2DocsState`) and `contractorDocs` (`ContractorDocsState`) locally and only exposes an `onValidityChange` boolean to its parent. `src/pages/DriverOnboarding.tsx` → `finalizeSubmission` iterates only the DB `templates` list (`driver_agreement`, `direct_deposit`) and never receives the W-4 / I-9 / W-9 / IOO field values or signatures. When the driver clicks Submit:

- Onboarding is marked complete (`profiles.onboarding_completed = true`).
- Success toast fires.
- W-4 SSN/filing status/dependents/signature, I-9 citizenship/DOB/SSN/work-auth/signature, direct-deposit bank/routing/account/signature, W-9 legal name/tax class/TIN/signature, and IOO MC/DOT/effective date/signature are all thrown away.

Result: admins can't run payroll for the driver and there's no record of what was signed.

## Fix (scope)

Wire the two doc-form states up to the parent, persist their data to existing tables/storage, and generate signed PDFs so admins have artifacts identical to the current `driver_agreement` / `direct_deposit` flow.

### 1. Expose form state to parent

`src/components/onboarding/DocumentSignatureStep.tsx`:
- Lift `w2Docs` / `contractorDocs` out of local state OR add `onW2DocsChange` / `onContractorDocsChange` callbacks to `DocumentSignatureStepProps`.
- Emit the current value on every change so the parent can persist on Submit.

`src/pages/DriverOnboarding.tsx`:
- Hold `w2Docs` / `contractorDocs` in page state (start from `EMPTY_W2_DOCS_STATE` / `EMPTY_CONTRACTOR_DOCS_STATE`).
- Pass them down and read them in `finalizeSubmission`.

### 2. Persist structured data (reuse existing tables where possible)

- **W-4**: upsert into existing `driver_w4_info` (already in schema) via a new `upsert_driver_w4` RPC or a direct insert scoped by `org_id` + `driver_id`. Fields: filing status, dependents amount, other income, deductions, extra withholding, multiple-jobs flag, SSN (stored encrypted like other PII if a column pattern exists; otherwise mirror how `drivers.ssn` is handled today).
- **Direct deposit**: reuse existing `upsert_driver_banking` RPC (already used for the `direct_deposit` template) with `dd_*` fields.
- **I-9**: no existing table. Add a small `driver_i9_info` table via migration (org_id, driver_id, full_name, other_last_names, address, dob, ssn, email, phone, citizenship enum, alien_number, work_auth_expiry, work_auth_doc_number, attested_at) + RLS mirroring `driver_w4_info`, plus GRANTs.
- **W-9** (1099): add `driver_w9_info` table (org_id, driver_id, legal_name, business_name, tax_class, tin_type, tin, address, certifications_ack, signed_at) + RLS + GRANTs.
- **IOO Agreement** (1099): store the structured fields (mc/dot/effective_date) as columns on a new `driver_ioo_agreement` row (or as JSON on `driver_signed_documents.metadata` if that column already exists — verify first). The signature/PDF is stored as a signed document (below).

### 3. Generate + upload signed PDFs

For each of `w4`, `i9`, `direct_deposit_form`, `w9`, `ioo_agreement`:
- Build a PDF (extend `src/lib/onboarding/generateSignedPdf.ts` or add sibling generators) using the collected fields + signature data URL.
- Upload to `signed-documents` under `${orgId}/${driverId}/${docType}-${ts}.pdf` (same pattern as today).
- Insert a `driver_signed_documents` row per form so admins see them in `SignedOnboardingDocuments.tsx` alongside existing docs.

### 4. Ordering & error handling

In `finalizeSubmission`:
1. Run existing template loop unchanged.
2. If `employmentType === 'W-2'`: persist W-4 → I-9 → banking → upload three signed PDFs → insert three `driver_signed_documents` rows.
3. If `employmentType === '1099'`: persist W-9 + IOO → upload two signed PDFs → insert two rows.
4. Only flip `profiles.onboarding_completed = true` after every step above succeeds. On failure, throw so the outer `try/catch` shows the real error instead of the success toast.

### 5. Admin visibility

`SignedOnboardingDocuments.tsx` already lists `driver_signed_documents` by `document_type`. Add labels for `w4`, `i9`, `w9`, `ioo_agreement`, `direct_deposit_form` to `DOCUMENT_LABELS` there and in `src/pages/DriverOnboarding.tsx`'s `DOCUMENT_LABELS`.

## Files to change

- `src/components/onboarding/DocumentSignatureStep.tsx` — lift state / add change callbacks.
- `src/pages/DriverOnboarding.tsx` — hold and persist W-2 / 1099 payloads in `finalizeSubmission`.
- `src/lib/onboarding/generateSignedPdf.ts` (+ possibly new sibling files) — PDF templates for W-4/I-9/W-9/IOO/direct-deposit-form.
- `src/components/drivers/SignedOnboardingDocuments.tsx` — new document-type labels.
- New migration: `driver_i9_info`, `driver_w9_info`, `driver_ioo_agreement` tables with RLS + GRANTs matching the existing `driver_w4_info` pattern; optionally an `upsert_driver_w4` RPC.

## Out of scope

- Rehydrating saved values into the form on revision rounds (separate follow-up).
- Pushing W-4 to Gusto — the existing payroll sync path can pick up `driver_w4_info` on its next run.

## Verification

1. Complete onboarding as a W-2 driver in the preview → confirm five signed docs appear in the admin driver sheet (agreement, direct deposit template, W-4, I-9, direct deposit form) and rows exist in `driver_w4_info` / `driver_i9_info` / `driver_banking_info`.
2. Complete as a 1099 driver → confirm agreement + W-9 + IOO signed docs and `driver_w9_info` / `driver_ioo_agreement` rows.
3. Force a persistence error (e.g. bad routing number) → confirm the failure toast fires and `profiles.onboarding_completed` stays `false`.
