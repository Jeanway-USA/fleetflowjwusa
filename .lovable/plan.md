# Capture & expose driver banking info from onboarding

Today, bank name / type / routing / account # are typed during onboarding, baked into the Direct Deposit PDF (account number masked to last 4), and then **thrown away**. The signed PDF is the only record, and Safety can also read it. We need this data retrievable by **Owner + Payroll Admin** for downstream payroll use.

## What we'll build

### 1. New table `driver_banking_info` (one row per driver)
Columns: `driver_id` (unique), `org_id`, `bank_name`, `account_type` (checking/savings), `routing_number_encrypted`, `account_number_encrypted`, `account_number_last4`, `updated_at`, `created_at`.

- Encryption at rest using the existing `CREDENTIAL_ENCRYPTION_KEY` pattern (mirrors `org_storage_config.encrypted_credentials` per security memory).
- RLS: **Owner + Payroll Admin only**, scoped to `org_id`. No anon grant. `service_role` full access.
- Two security-definer RPCs:
  - `upsert_driver_banking(...)` — driver (their own) or owner can write.
  - `get_driver_banking(driver_id)` — only owner/payroll, returns decrypted fields.

### 2. Onboarding submit flow (`src/pages/DriverOnboarding.tsx`)
After the Direct Deposit template is signed and the signed PDF is uploaded, call `upsert_driver_banking` with the entered values (in addition to the existing PDF generation). PDF continues to show masked `****1234` so the signed copy itself is safe.

### 3. View in admin UI
- New `DriverBankingDetails` component shown inside `DriverDetailSheet` under "Signed Documents", **only when `isOwner || hasRole('payroll_admin')`**. Safety does NOT see it.
- Displays bank name, account type, routing, and account number with a "Reveal" toggle (default masked to last 4).
- Uses `get_driver_banking` RPC.

### 4. Tighten Direct Deposit PDF access
Currently `SignedOnboardingDocuments` shows all signed docs to Owner/Safety/Payroll. The Direct Deposit PDF contains bank name/routing — restrict **that document type** to Owner + Payroll only, both in the UI and in the storage RLS policy on the `signed-documents` bucket (path-aware check on `direct_deposit`). Driver Agreement remains visible to Safety.

## Technical details

- **Schema**: new `public.driver_banking_info` with composite unique on `(org_id, driver_id)` per multi-tenant settings convention.
- **Encryption**: pgcrypto `pgp_sym_encrypt` / `pgp_sym_decrypt` keyed by `current_setting('app.credential_key')` populated from the `CREDENTIAL_ENCRYPTION_KEY` secret inside the security-definer RPCs (so the key never reaches the client).
- **RLS policies**:
  - `SELECT/UPDATE/INSERT` for `(is_owner OR has_role payroll_admin) AND org_id = get_user_org_id(auth.uid())`.
  - Additional `INSERT/UPDATE` allowed for `driver_id = get_driver_id_for_user(auth.uid())` so drivers can save their own during onboarding (write-only — they can't `SELECT` decrypted values via the RPC unless owner/payroll).
- **GRANTs**: `SELECT, INSERT, UPDATE` to `authenticated`; `ALL` to `service_role`. No anon.
- **Storage policy update**: split the existing `signed-documents` SELECT policy so `document_type = 'direct_deposit'` paths require owner/payroll. Easiest path: include doc type in the storage prefix (already saved per-document) and add an RLS check.
- **Types**: `src/integrations/supabase/types.ts` regenerates automatically.

## Out of scope (per your answers)
- SSN/Tax ID storage
- Emergency contact storage
- Direct deposit attachment file is already saved on the driver row and stays as-is

Ready to implement on approval.
