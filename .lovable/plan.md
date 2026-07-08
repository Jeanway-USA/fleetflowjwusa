
## Goal

Legacy driver-signed documents in `driver_signed_documents` never went through the new sequential signing engine, so nothing shows up in the owner's "Action Required" queue on `/documents/signing`. This plan backfills a `document_instances` row (at the owner step) for every eligible legacy signature, plus a `document_signatures` row recording the driver's original signature — so owners can now countersign historical documents in one place.

## Eligibility

A legacy `driver_signed_documents` row is backfilled only when **all** of these are true:

1. There is an **active** `document_templates` row in the same `org_id` matching `document_type`.
2. That template's `signatory_roles` contains `owner` **after** `driver` (i.e., an owner countersignature step exists).
3. No `document_instances` row already exists linking to this legacy signature (idempotent — safe to re-run).

Currently that matches these types: `w2_driver_agreement`, `company_safety_policy`, `equipment_use_agreement`, `1099_driver_agreement`. Types like `driver_agreement`, `direct_deposit`, `w4`, `i9` have no active owner-required template, so they are skipped.

Existing `review_status` (`approved` / `pending`) on the legacy row is preserved and does not block backfill — admin approval is separate from the owner's signature step.

## Implementation

**1. One-time SQL backfill migration** (`supabase/migrations/…_backfill_owner_signing.sql`)

- Add a nullable `legacy_signed_document_id uuid` column + unique index on `document_instances` for idempotency and traceability.
- Insert into `document_instances` for each eligible legacy row:
  - `template_id` = matching active template
  - `title` = template name
  - `signatory_roles` = template's roles
  - `current_step` = 1 (driver step already done, owner is next)
  - `status` = `'pending_signatures'`
  - `driver_id`, `org_id`, `created_by` = driver's `user_id` (fallback to legacy row's driver)
  - `created_at` / `updated_at` = legacy `signed_at`
  - `legacy_signed_document_id` = legacy row id
- Insert into `document_signatures` a step-0 row for the driver's original signature:
  - `instance_id` = new instance id
  - `step_index` = 0
  - `role_label` = `'driver'`
  - `signer_id` = driver's `user_id`
  - `signed_at` = legacy `signed_at`
  - `signature_data_url` = `NULL` (legacy PDF holds the actual signature; store a marker like `'legacy:<file_path>'` in `metadata` or a note field so the workspace can link to the original PDF)
- Skip inserting `driver_notifications` for the trigger (this is a manual backfill; the `advance_document_instance` trigger only fires on new signature inserts going forward, and we're not advancing — we're seeding at step 1).

**2. UI touch-up on the workspace page**

- `DocumentSigningWorkspace` should, when an instance has a `legacy_signed_document_id`, show a "View driver's original signed PDF" button that opens the signed-documents storage file. No other logic changes; the owner then signs step 1 and the existing trigger completes the instance.

## Verification

- Run a `SELECT count(*)` before/after to confirm the expected number of new instances (4 eligible legacy rows in current data: the three from driver `8b1b2d7e…` on 2026-07-08 plus the `w2_driver_agreement`).
- Sign in as owner, open `/documents/signing`, confirm the four historical documents appear under **Action Required**.
- Countersign one; confirm status flips to `completed`.

## Out of scope

- Backfilling `driver_agreement` / `direct_deposit` / `w4` / `i9` — no active owner-signing template exists for those. If you want those routed for owner signature too, we'd first need to activate/create templates with `signatory_roles = {driver, owner}`.
- Regenerating a combined PDF for legacy documents — the original driver-signed PDF stays as the source of truth; the owner's countersignature is captured in the new engine.
