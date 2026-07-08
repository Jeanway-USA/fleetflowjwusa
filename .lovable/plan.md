
## Diagnosis

The composed PDF is being built in the browser, then the browser tries to write it to storage and update `document_instances` directly. The RLS policies I added should allow the owner, but the toast the user saw shows the write is still being rejected — most likely because the compose ran once before the RLS migration was approved, cached the failure, and now some later condition (impersonation, refreshed session, or unusual auth state) is keeping it broken. Fighting RLS from the client for a write that must always succeed for whoever finishes the last signature is fragile.

The clean fix is to stop writing to storage/DB from the browser and instead post the composed PDF bytes to a small edge function that uses the service role.

## Fix

**1. New edge function `finalize-document-instance`**

- Reads the user's JWT with the anon client to establish `auth.uid()`.
- Validates the caller: they must be a signer of that instance (row in `document_signatures` for `signer_id = auth.uid()`), and the instance's `status` must be `completed`. This is stricter than "is owner" — it also lets whoever is the final signer complete the artifact regardless of role.
- Accepts `{ instance_id, pdf_base64 }`. Decodes the bytes.
- Uses the **service-role** client to:
  - Upload to `signed-documents/{org_id}/completed/{instance_id}.pdf` with `upsert: true`.
  - Update `document_instances.pdf_storage_path` for that row.
- Returns `{ path }`.
- CORS-enabled, `verify_jwt = false` in code (validates the JWT itself).

**2. `composeCompletedPdf` client refactor**

Keep the PDF assembly (pdf-lib merge + jsPDF signature page — already working) but replace the final `storage.upload` + `document_instances.update` block with a single `supabase.functions.invoke('finalize-document-instance', { body: { instance_id, pdf_base64 } })` call.

**3. Remove now-unused storage policies**

Drop the two `Owner payroll can upload/update completed signed documents` policies from the previous migration — the service-role edge function bypasses RLS, and keeping unnecessary INSERT/UPDATE policies on `storage.objects` widens the attack surface (would let owners write any path under their org, including overwriting driver-signed originals).

**4. UI**

No changes — the existing "Assembling the final PDF with all signatures…" spinner already flips to the download button once `pdf_storage_path` is populated.

## Verification

1. Reload the completed instance screen. The `useEffect` re-fires, invokes the edge function, and the spinner should switch to the "Download completed PDF" button within a second.
2. Download the PDF — page 1 = original driver-signed doc, appended page = owner's signature image, name, and date.
3. Repeat for the other two backfilled instances — all three should populate `pdf_storage_path`.

## Out of scope

- Rendering the final PDF entirely server-side (would need a Deno-compatible PDF renderer; the current client generation already works and just needs the storage write moved).
