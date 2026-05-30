# Supplemental Direct Deposit Attachment

Currently, the direct-deposit step only generates a signed PDF stored in the `signed-documents` bucket and recorded in `driver_signed_documents.file_path`. We'll add support for a supplemental upload (e.g., voided check) that the driver attaches during onboarding.

## 1. Database schema

Migration adds one column to `driver_signed_documents`:

- `attachment_file_path TEXT NULL` — stored path of supplemental upload (PDF/JPG/PNG).

No new table. The existing row inserted at onboarding completion will carry both the generated signed PDF (`file_path`) and the supplemental attachment (`attachment_file_path`).

For convenience on the driver record itself, also add to `drivers`:

- `direct_deposit_attachment_url TEXT NULL` — last-known path for quick lookup on the driver profile.

Both columns are nullable, no backfill needed. Existing RLS/GRANTs already cover the tables.

## 2. Storage bucket

Reuse the existing **private** `signed-documents` bucket — its path convention is already `{org_id}/{driver_id}/...` and storage policies enforce per-org/driver access. Supplemental uploads will go to:

```
{org_id}/{driver_id}/direct_deposit_attachment-{timestamp}.{ext}
```

Accepted MIME types enforced client-side: `application/pdf`, `image/jpeg`, `image/png`. Max ~10 MB. No new bucket or policy required.

## 3. Onboarding UI + save logic

- `src/components/onboarding/DocumentTemplateRenderer.tsx` — when the current template is `direct_deposit`, render a file input ("Attach voided check or bank letter (PDF/JPG/PNG)"). Expose `attachment: File | null` via a new `onAttachmentChange` callback.
- `src/pages/DriverOnboarding.tsx`:
  - Extend `TemplateState` with `attachment: File | null`.
  - In `finalizeSubmission`, after uploading the generated signed PDF, if the template is `direct_deposit` and an attachment is present:
    1. Upload to `signed-documents` at the path above.
    2. Set `attachment_file_path` on the `driver_signed_documents` insert payload.
    3. Update the driver row's `direct_deposit_attachment_url` with the same path.
  - Make the attachment **required** for the `direct_deposit` step (extend `canContinue`).

## 4. Display

- `src/components/drivers/SignedOnboardingDocuments.tsx` — when a row has `attachment_file_path`, show a second "Download attachment" button alongside the signed PDF.

## Out of scope

- No changes to PDF generation, templates, or the existing signed-PDF flow.
- No new bucket; reusing `signed-documents`.
- No edge function changes.
