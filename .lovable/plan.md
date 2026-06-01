## Problem

The driver is on iPhone uploading a photo from the camera roll for the Direct Deposit step. iPhone photos default to **HEIC** format, which the current file input rejects (`accept="application/pdf,image/jpeg,image/png"`). Depending on the iOS version, the file is either silently dropped, or the >10MB check silently clears it with no feedback, leaving the driver stuck on "file failing to upload."

Additionally, when an upload error does fire, the toast shows the raw Supabase message but we have no inline UI feedback at the file input itself.

## Fix (frontend only — `src/components/onboarding/DocumentTemplateRenderer.tsx` and `src/pages/DriverOnboarding.tsx`)

1. **Broaden the file input** in `DocumentTemplateRenderer.tsx` (the `file_upload` case):
   - Change `accept` to `application/pdf,image/*,.heic,.heif` so iOS does not filter camera-roll HEIC photos out of the picker.
   - Add `capture="environment"` so iPhone users get an obvious "Take Photo" option in addition to the library picker.

2. **Show inline validation errors** (instead of silently nulling the file):
   - Track a local `uploadError` string state in the renderer.
   - If `file.size > 10 MB` → set error "File is too large (max 10 MB)."
   - If the file is HEIC/HEIF (`file.type === 'image/heic' || 'image/heif'` or name ends in `.heic`/`.heif`) → set error: "iPhone HEIC photos aren't supported. In Settings → Camera → Formats choose 'Most Compatible', or upload a PDF/JPG/PNG instead."
   - Render the error in red below the input so the driver sees exactly why it didn't attach.

3. **Make the storage upload more forgiving** in `DriverOnboarding.tsx` (`handleSubmit` attachment branch around line 297–307):
   - Fall back to `contentType: file.type || 'application/octet-stream'` (already done) but also default the file extension to `jpg` when missing/unknown so the path is always valid.
   - Wrap the attachment upload in its own try/catch so the toast shows: `"Couldn't upload attachment: <supabase error>. Try a PDF or JPG."` instead of the generic submit-failure message — gives the driver and us a real diagnostic next time.

4. **No backend/RLS/bucket changes.** The `signed-documents` bucket already accepts any MIME (no allow-list) and the existing RLS policy `Drivers can upload their own signed documents` already covers the path `${orgId}/${driverId}/...`. The failure is purely client-side: HEIC file getting blocked by the input + silent failure UX.

## Out of scope

- Server-side HEIC → JPEG conversion (would require an edge function + heavy decoder; the broader `accept` + clear messaging covers the real-world case).
- Changing the bucket's MIME allow-list (it has none — not the cause).
- Touching the re-onboarding flow or any other upload surface.

## Verification

- Confirm the file input on the Direct Deposit step now shows the iPhone "Photo Library / Take Photo / Choose File" sheet with HEIC images selectable.
- Confirm uploading a >10 MB file shows an inline red error.
- Confirm uploading a JPG/PNG/PDF still succeeds end-to-end and writes the row to `driver_signed_documents` with `attachment_file_path` set and `drivers.direct_deposit_attachment_url` updated.
