

# Fix: Rate Confirmation Parsing on Live Site

## Problem
The "Failed to send a request to the Edge Function" error occurs because the 6-page PDF, when converted to base64 and sent as a JSON body, creates a request payload of 5-10MB. The Supabase functions relay rejects this before it reaches the edge function. Only the OPTIONS preflight succeeds; the actual POST never arrives.

## Solution
Instead of sending the entire PDF as base64 in the request body, upload it to temporary storage first, then pass the storage path to the edge function. The function downloads the file server-side (no size limit concerns) and processes it.

## Technical Details

### 1. Update `src/components/loads/RateConfirmationUpload.tsx`

Change the `processFile` function to:
1. Upload the PDF to the `documents` storage bucket under a `temp-rc/` prefix
2. Call the edge function with just the `filePath` instead of `pdfBase64`
3. Clean up the temporary file after parsing completes (success or failure)
4. Add better error messaging to surface the actual error details

### 2. Update `supabase/functions/parse-rate-confirmation/index.ts`

Modify the edge function to:
1. Accept either `filePath` (new) or `pdfBase64` (backward-compatible)
2. If `filePath` is provided, download the file from the `documents` storage bucket using the service role client
3. Convert the downloaded file to base64 for the AI Gateway call
4. Delete the temporary file from storage after processing
5. Keep all existing AI prompt logic, authentication, and CORS unchanged

### 3. No Database Changes
No migrations needed. Uses the existing `documents` storage bucket for temporary file storage.

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- Upload PDF to storage, send path instead of base64
- `supabase/functions/parse-rate-confirmation/index.ts` -- Download from storage instead of receiving base64

