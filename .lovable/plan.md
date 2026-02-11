
# Fix: Rate Confirmation Upload Failing on Live Site

## Problem
The current approach uploads the PDF to storage first, then passes the path to the edge function. On the live site, the `supabase.storage.upload()` call returns an HTML error page instead of JSON, causing the "Unexpected token '<'" parse error.

## Root Cause
The Supabase relay/proxy on the live domain appears to intercept or reject the storage upload request and returns an HTML error page instead of a proper JSON response. This doesn't happen in the preview environment.

## Solution
Send the PDF file directly to the edge function as raw binary (not base64 in JSON, not through storage). Use `fetch()` with the raw file as the body and `Content-Type: application/pdf`. This bypasses both:
- The JSON payload size limit (which broke the original base64 approach)
- The storage upload issue (which breaks the current approach on live)

## Technical Details

### 1. Update `src/components/loads/RateConfirmationUpload.tsx`

Replace the storage-upload-then-invoke pattern with a direct `fetch()` call:
- Get the current session token via `supabase.auth.refreshSession()`
- Build the edge function URL from `VITE_SUPABASE_URL`
- Send the PDF file as raw binary body with `Content-Type: application/pdf`
- Include the Authorization header and apikey header manually
- Remove all storage upload/cleanup code

### 2. Update `supabase/functions/parse-rate-confirmation/index.ts`

Modify the edge function to accept the PDF in three ways:
- **New (primary):** Raw binary body with `Content-Type: application/pdf` -- reads `req.arrayBuffer()`, converts to base64
- **Existing:** `filePath` in JSON body (backward compat)
- **Existing:** `pdfBase64` in JSON body (backward compat)

Detection logic: check the `Content-Type` header. If it's `application/pdf`, read the body as raw bytes. Otherwise, parse as JSON and use the existing `filePath`/`pdfBase64` logic.

### 3. No Database or Storage Changes
No migrations needed. No storage policy changes. The solution completely bypasses client-side storage operations.

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- Direct fetch to edge function with raw PDF body
- `supabase/functions/parse-rate-confirmation/index.ts` -- Accept raw PDF binary body
