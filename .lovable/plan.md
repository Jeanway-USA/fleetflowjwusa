

# Thorough Fix: Rate Confirmation Upload on Published Site

## Root Cause Analysis

The edge function analytics prove the request from the published site never reaches the backend. The "Failed to send a request to the Edge Function" error is a client-side network failure occurring at the Lovable Cloud relay layer.

Three possible causes:
1. The published site may still be running older code (raw `fetch()` approach) that was not yet published
2. The relay has a request body size limit and the base64-encoded PDF exceeds it
3. The relay is timing out or rejecting the request for another reason

## Solution: Defense-in-Depth Approach

We will implement multiple layers of protection to ensure the upload works reliably regardless of the specific relay behavior.

### 1. Client-Side: Add File Size Validation and Retry Logic

**File: `src/components/loads/RateConfirmationUpload.tsx`**

- Add file size check before processing (max 5MB raw = ~6.7MB base64). Show a clear error if the file is too large.
- Add retry logic: if the first `supabase.functions.invoke` call fails with a network error, retry once after a 1-second delay.
- Add detailed error categorization so the user sees a helpful message:
  - "File is too large" for size issues
  - "Network error - please check your connection" for fetch failures
  - "Server error" for function-level errors
- Log the actual error details to console for debugging

### 2. Edge Function: Add Published URL to CORS and Support FormData

**File: `supabase/functions/parse-rate-confirmation/index.ts`**

- Add the published URL `https://fleetflowjwusa.lovable.app` explicitly to the ALLOWED_ORIGINS list (don't rely solely on the wildcard)
- Add support for `multipart/form-data` Content-Type as a third input method -- this allows sending the raw file via FormData which is ~33% smaller than base64 and handled more naturally by HTTP proxies
- Detection order:
  1. `application/pdf` -- raw binary body
  2. `multipart/form-data` -- FormData with file
  3. `application/json` or other -- JSON body with `pdfBase64` or `filePath`

### 3. Client-Side: FormData Fallback

**File: `src/components/loads/RateConfirmationUpload.tsx`**

If the primary base64 JSON approach fails with a network error:
1. First retry with the same base64 JSON approach (handles transient failures)
2. If that also fails, try a FormData approach where the raw File is sent directly via `supabase.functions.invoke({ body: formData })` -- this avoids the 33% base64 overhead and may pass through the relay

```text
Attempt Flow:
  [1] SDK invoke with { pdfBase64 } (JSON, ~133% of file size)
       |
       v -- fails? -->
  [2] Retry SDK invoke with { pdfBase64 } after 1s delay
       |
       v -- fails? -->
  [3] SDK invoke with FormData (raw file, ~100% of file size)
       |
       v -- fails? -->
  [4] Show detailed error with file size info
```

### 4. Matching `parse-landstar-statement` CORS Pattern

Ensure the CORS configuration exactly matches the working `parse-landstar-statement` function for consistency. Currently they're slightly different (rate confirmation has extra Supabase client headers that statement doesn't).

## Technical Details

### Edge Function CORS Update
```typescript
const ALLOWED_ORIGINS = [
  'https://fleetflowjwusa.lovable.app',   // published
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',  // preview
  'http://localhost:5173',
  'http://localhost:8080',
];
```

### Edge Function FormData Support
```typescript
if (contentType.includes('multipart/form-data')) {
  const formData = await req.formData();
  const file = formData.get('file');
  if (file && file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    pdfBase64 = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
  }
}
```

### Client Retry + Fallback
```typescript
const processFile = async (file: File) => {
  // Size validation
  if (file.size > 5 * 1024 * 1024) {
    toast.error('PDF file must be under 5MB');
    return;
  }

  // Attempt 1: base64 JSON via SDK
  let result = await tryInvokeWithBase64(file);
  
  // Attempt 2: retry base64 JSON
  if (result.networkError) {
    await delay(1000);
    result = await tryInvokeWithBase64(file);
  }
  
  // Attempt 3: FormData fallback
  if (result.networkError) {
    result = await tryInvokeWithFormData(file);
  }
};
```

## Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- file size validation, retry logic, FormData fallback, better error messages
- `supabase/functions/parse-rate-confirmation/index.ts` -- published URL in CORS, FormData input support

## Important: Publishing
After these changes are implemented, you MUST publish the app before testing on the live site. The error may be happening because the published site is still running code from a previous iteration.

