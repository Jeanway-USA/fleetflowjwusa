# Automatic Client-Side Image Compression for Uploads

## Goal
Compress every image file in the browser before it's uploaded to Lovable Cloud storage. Target ≤ ~800 KB per image (configurable up to 1 MB), preserve readability for document scans, and surface a clear loading state so users know the compression + upload is in progress.

## Approach
1. **One shared utility** that all upload paths call.
2. **Centralize the call** inside the storage helper that nearly every upload already routes through (`useStorageProvider.uploadFile`), so app-wide coverage is automatic.
3. **Patch the few direct `supabase.storage.from(...).upload(...)` call sites** that bypass the helper.
4. **Use existing per-call `uploading` flags / spinners** in the consumer components; verify each spinner stays visible during the (new) compression step.

## Files / changes

### 1. New util — `src/lib/compress-image.ts`
- `compressImage(file: File, opts?): Promise<File>` (returns the original `File` untouched when not an image, when SVG, or when already under the target).
- Logic:
  - Skip if `!file.type.startsWith('image/')` or `file.type === 'image/svg+xml'` or `file.size <= targetBytes` (default 800 KB) AND already JPEG/WebP.
  - Decode with `createImageBitmap(file)` (fallback to `<img>` + `URL.createObjectURL`).
  - Compute scaled dimensions so the longest edge ≤ 2400 px (configurable). Documents need readable text, so we cap at 2400 px instead of 1600 px.
  - Draw to an `OffscreenCanvas` (fallback `HTMLCanvasElement`) with white background fill (preserves white-paper look when source is transparent PNG).
  - Encode iteratively: start at quality 0.85, try `image/webp` first; if browser doesn't return a blob for webp, fall back to `image/jpeg`. If result > target, lower quality in steps of 0.1 down to 0.5; if still > target, scale dimensions down by 0.85 and retry (max 3 rescale loops).
  - Re-wrap in `new File([blob], renamedToMatchMime, { type: blob.type, lastModified: file.lastModified })`. Original extension swapped to `.webp` / `.jpg`.
  - On any failure, log and return the original `File` (never block an upload).

### 2. `src/hooks/useStorageProvider.ts`
- Import `compressImage`.
- At the top of `uploadFile`, replace the incoming `file` with `await compressImage(file)` only when it's a `File` (not a `Blob` without a name/type — those are already programmatic, e.g. signature pads, and must remain unchanged).
- Covers: `useDocumentUpload`, onboarding paperwork, load/POD photos, smart load creator, rate confirmation, work-order attachments, anything else routed through `useStorageProvider`.

### 3. Direct-upload call sites that bypass the helper
Patch these to call `compressImage` before their direct `supabase.storage.from(...).upload(...)`:
- `src/components/drivers/DriverBankingDetails.tsx` (voided check images — sensitive, compress at 80% quality only).
- `src/components/settings/BrandingTab.tsx` (logo upload — already small typically; compression still applied for huge PNG drops).
- `src/components/shared/BetaFeedbackWidget.tsx` (html2canvas screenshot — already a blob, but wrap in File and compress).
- `src/pages/DriverOnboarding.tsx` and `src/pages/Onboarding.tsx` (any direct uploads found there during edit).
- `src/components/driver/ProofOfDeliveryDialog.tsx` and `src/components/driver/PhotoCapture.tsx` (camera photos — biggest win).
- `src/components/loads/SmartLoadCreator.tsx` and `src/components/loads/RateConfirmationUpload.tsx` (PDF inputs: skipped automatically; image inputs: compressed).
- `src/components/maintenance/CompleteJobModal.tsx` and `src/components/crm/CarrierDocumentHub.tsx` (attachments).
- `src/components/drivers/SignedOnboardingDocuments.tsx` (PDFs, will be auto-skipped).

For each, the diff is one line: `const fileToUpload = await compressImage(file); ... upload(..., fileToUpload)`.

### 4. Loading state / spinner verification
- `useDocumentUpload` already exposes `uploading`; consumers (`SignedOnboardingDocuments`, `CarrierDocumentHub`, etc.) already render a spinner from it. Compression runs inside the same `try` block, so the spinner naturally covers both phases.
- For the inline call sites above, each already has a local `uploading`/`isSubmitting` flag — confirm it's set BEFORE `compressImage` and cleared AFTER the upload resolves. Update where the flag is currently set only around the network call.
- `ProofOfDeliveryDialog` and `PhotoCapture`: add a small "Compressing image…" / "Uploading…" copy swap if not already present (use existing `<Loader2 className="animate-spin" />` patterns).

### 5. Validation
- Drop a 6 MB phone photo into the Driver Onboarding paperwork upload → confirm spinner shows, network payload to `/storage/v1/object/documents/...` is ≤ ~1 MB, and the stored file opens with readable text in the viewer.
- Upload a 200 KB scanned receipt → confirm it is left untouched (no quality loss, no extension change).
- Upload a 2 MB PDF rate confirmation → confirm the util skips PDFs and uploads the original bytes.
- Confirm Branding logo SVG upload is untouched (skipped).
- POD photo from mobile camera → confirm WebP-encoded, < 800 KB, spinner displayed during compression + upload.

## Out of scope
- No server-side recompression / edge function changes.
- No changes to view/download paths (existing signed URL logic unchanged).
- No bucket-level changes (existing private buckets continue to enforce RLS).
