## Goal

When a driver finishes signing the dynamic onboarding documents, generate a finalized PDF per document, persist references on the driver's profile, and surface a one-time "Download Signed PDF" button on a success screen only.

## Changes

### 1. New table `driver_signed_documents`
Stores one row per signed document (driver_agreement, direct_deposit, ...).

Columns: `id`, `org_id`, `driver_id`, `template_id`, `document_type`, `file_path` (storage path), `signature_data_url` (text), `driver_address` (text), `signed_at`, `created_at`.

- Private storage bucket `signed-documents` with `{org_id}/{driver_id}/{document_type}-{timestamp}.pdf` path.
- RLS: drivers can insert/select their own rows; owner/safety/payroll can select within org; service_role full.
- Storage policies mirror the same prefix check used by other tenant buckets.

### 2. Client-side PDF generation
Use `jspdf` (small, already-friendly with Vite) to build a simple receipt-style PDF per template:
- Header: document title + "Signed on {date}".
- Body: the template content with tokens replaced inline as plain text:
  - `{{today_date}}` → formatted date
  - `{{company_address}}` → "4700 Diplomacy Rd, Fort Worth, TX 76155"
  - `{{owner_signature}}` → "Owner Signature Pending"
  - `{{driver_address}}` → entered address
  - `{{driver_signature}}` → embedded PNG from the SignaturePad data URL (via `doc.addImage`)
- Footer: driver name + signed timestamp.

New helper `src/lib/onboarding/generateSignedPdf.ts` exporting `generateSignedPdf({ template, driverAddress, signature, driverName }) => Blob`.

### 3. Submission flow in `DriverOnboarding.tsx`
On final "Submit":
1. Resolve driver row (`drivers` table, `user_id = auth.uid()`) to get `driver_id` and name.
2. For each template in state: generate PDF blob → upload to `signed-documents` bucket → insert row in `driver_signed_documents` with the returned path.
3. Collect the storage paths + signed URLs (24h) into local state `signedResults`.
4. Switch the page into a `submitted` view (no navigation away).

### 4. Success screen (in-page, transient)
- Replaces the stepper card once `submitted=true`.
- Shows "All documents signed" confirmation, list of each document with a "Download Signed PDF" button that uses the in-memory signed URL (or re-creates one on click via `createSignedUrl`).
- A "Go to Dashboard" button navigates to `/driver`.
- Because the URLs/blobs live in component state only, the button does not appear anywhere else; the regular driver dashboard is untouched.

### 5. No changes to driver dashboard
Explicitly skip wiring any download UI into `/driver`. Drivers who want copies later would need a separate documents page (out of scope).

## Out of scope
- Owner countersigning workflow.
- Re-download UI from the dashboard or a documents page.
- Email delivery of signed PDFs.
- PDF visual polish beyond a clean single-column receipt layout.

## Technical notes
- Adds dependency: `jspdf`.
- Uses existing `supabase` client; uploads via `supabase.storage.from('signed-documents').upload(...)` and inserts via `from('driver_signed_documents').insert(...)`.
- All inserts include `org_id` and `driver_id` to satisfy RLS.
