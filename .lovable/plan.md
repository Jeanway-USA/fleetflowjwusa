# Unmask private info for owner / payroll admin

Goal: owners and payroll admins can view and download full SSN, TIN, and bank routing/account numbers everywhere they need to run payroll, taxes, and settlements. Drivers and other roles keep the current redacted view. Every decrypt is logged to `audit_logs`.

## 1. Database — new decrypt RPCs (migration)

Create two `SECURITY DEFINER` functions in `public`, both gated on `is_owner(auth.uid()) OR has_role(auth.uid(),'payroll_admin')` and scoped to the caller's org. Each writes an `audit_logs` row on every call (action `ssn_decrypt_view` / `tin_decrypt_view`), mirroring the existing `get_driver_banking` pattern.

- `get_driver_ssn(_driver_id uuid) → text` — decrypts `driver_i9_info.ssn_encrypted` with `banking_encryption_key` and returns the digits.
- `get_driver_tin(_driver_id uuid) → text` — decrypts `driver_w9_info.tin_encrypted` and returns the digits.
- `get_driver_tin_by_org` variant is not needed — Tax Hub already loops per driver.

No schema changes to storage or existing tables.

## 2. Client hooks

New file `src/hooks/useSensitiveDriverData.ts`:

- `useDriverSsn(driverId)` — `enabled` only when `isOwner || hasRole('payroll_admin')`, calls `supabase.rpc('get_driver_ssn')`. 5 min staleTime.
- `useDriverTin(driverId)` — same shape for W-9 TIN.
- `useDriverBankingFull(driverId)` — thin wrapper around existing `get_driver_banking` used by the settlement voucher and the "admin copy" signed-doc regenerator.

## 3. Settlement check voucher — real routing number

- `SettlementCheckVoucher.tsx`: replace hardcoded `"XXXX-XXXX-XXXX"` with a `useDriverBankingFull(driverId)` fetch. Render the real 9-digit routing when available; fall back to `—` when banking hasn't been set. Only owner/payroll can render this component (already gated by the settlements module).
- `generateSettlementPdf.ts`: accept `bankRouting`/`bankAccountLast4` params from the caller and stamp them into the check-voucher block instead of the placeholder. Callers in `SettlementCheckVoucher` (preview) and the settlement PDF button pass the values from the same RPC.

## 4. Tax Hub — full SSN/TIN

- `TaxHub.tsx` 1099 list: replace the `•••• {tin_last4}` badge with the full TIN from `useDriverTin`, formatted `XX-XXXXXXX` (EIN) or `XXX-XX-XXXX` (SSN) based on `tin_type`. Missing TIN still shows the "collect W-9" state.
- W-2 tab (if driver list is shown there): add SSN column pulled from `useDriverSsn`.
- Values render inline for allowed roles; the page itself is already `owner|payroll_admin`-only, so no extra gate is needed.

## 5. W-2 & 1099-NEC PDFs — full number for admin generation

- `generateW2Pdf.ts`: replace `ssnLast4?: string | null` with `ssnFull?: string | null`. Format as `XXX-XX-XXXX` when full digits are available; fall back to `XXX-XX-{last4}` if only last4 is passed.
- `generate1099NecPdf.ts`: same treatment for `tin`. Format EIN vs SSN based on `tin_type` supplied by the caller.
- Caller in `TaxHub.tsx` (per-driver W-2 / 1099 export): pre-fetch full SSN/TIN via the new RPCs before calling the PDF generator. If the RPC fails (e.g., no encrypted value on file), fall back to the existing last-4 behavior and toast a warning.

## 6. Signed onboarding PDFs — dual copy

`src/lib/onboarding/generateSignedPdf.ts` — parameterize masking:

- Add a `redact: boolean` option (default `true`). When `false`, the `ssn` and `account_number` tokens render the full digits instead of `***-**-1234` / `****1234`.

`src/pages/DriverOnboarding.tsx` (signing flow) — generate and store TWO artifacts per signed document:

- `redacted` copy at existing path `signed-documents/{org_id}/{driver_id}/{document_type}/{id}.pdf` (unchanged behavior, drivers keep access).
- `full` copy at `signed-documents/{org_id}/{driver_id}/{document_type}/{id}.full.pdf` — new path, RLS-restricted below.
- Insert into `driver_signed_documents`: keep `file_path` = redacted, add new nullable column `admin_file_path` for the full copy (migration section 1 adds this column).

`SignedOnboardingDocuments.tsx` (admin view):

- Add a second "Download (full data)" button per row that opens `admin_file_path` via a signed URL. Only rendered when `isOwner || hasRole('payroll_admin')` and `admin_file_path` is not null.
- Existing Preview/Download continue to use `file_path` (redacted).

Storage RLS on `signed-documents` for `*.full.pdf` objects: restrict SELECT to `is_owner(auth.uid()) OR has_role(auth.uid(),'payroll_admin')` scoped to the org prefix. Achieved via a policy that checks the object name matches `%.full.pdf` and enforces the role predicate.

Backfill: no retroactive generation of full copies for documents already signed — those keep `admin_file_path IS NULL`. Owners can request a re-sign via the existing Revision Request flow if a full copy is required.

## 7. Roles kept unchanged

- Drivers, dispatcher, safety, admin (generic), and everyone else continue to see the redacted values everywhere. The `safety` role loses no existing capability — it never had SSN/TIN access.
- Impersonating super admins inherit whatever role they impersonate; the RPCs check `auth.uid()`, so impersonation still works within the destination org's role.

## Technical notes

- New DB column: `driver_signed_documents.admin_file_path text NULL` — migration adds it. No default; old rows stay null.
- The two decrypt RPCs read the encryption key from `public.internal_config` (same key used by `get_driver_banking` / `upsert_driver_w9`).
- Audit log entries include `driver_id` and the acting user id so we can produce a "who viewed what" report later.
- Types file (`src/integrations/supabase/types.ts`) will regenerate after the migration approval — no manual edits.
- No changes to storage buckets, only a new object-name-scoped RLS policy on `storage.objects`.
