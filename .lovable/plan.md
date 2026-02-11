
# Fix: Rate Confirmation Upload -- Storage-First Approach

## Root Cause (Confirmed via Analytics)
The Lovable Cloud relay is silently dropping POST requests to the edge function from the published domain. Analytics show 6 OPTIONS (preflight) requests reaching the server but zero POST requests. This is a relay-layer issue that cannot be fixed from our code -- we must work around it.

## Why Previous Fixes Failed
1. Raw `fetch()` -- blocked by relay/CORS on published domain
2. `supabase.functions.invoke()` with binary body -- relay corrupts it
3. `supabase.functions.invoke()` with base64 JSON body -- relay drops the POST
4. FormData fallback -- relay also drops the POST

All approaches send the PDF data IN the edge function request body. The relay appears to have an issue forwarding POST bodies to edge functions from the published domain.

## Solution: Upload to Storage First, Then Invoke

Split the operation into two steps:
1. Upload PDF to Supabase Storage (uses REST API, NOT the functions relay -- proven to work from published site via document uploads)
2. Call edge function with just the storage path string (tiny JSON body ~50 bytes, much more likely to pass through relay)

The edge function already has full support for the `filePath` input method (lines 236-253), including automatic cleanup of the temp file after processing.

## Technical Details

### File: `src/components/loads/RateConfirmationUpload.tsx`

Replace the entire multi-attempt strategy (tryInvokeWithBase64, tryInvokeWithFormData, retry logic) with:

```typescript
const processFile = async (file: File) => {
  // 1. Upload to storage as temp file
  const tempPath = `temp-rc/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(tempPath, file, { contentType: 'application/pdf' });
  
  if (uploadError) throw new Error('Failed to upload file');

  // 2. Call edge function with just the path (tiny body)
  const { data, error: fnError } = await supabase.functions.invoke(
    'parse-rate-confirmation',
    { body: { filePath: tempPath } }
  );
  
  // Edge function auto-deletes the temp file after processing
};
```

Remove:
- `fileToBase64` helper function
- `tryInvokeWithBase64` function
- `tryInvokeWithFormData` function
- `isNetworkError` helper
- `delay` helper
- `InvokeResult` type
- All retry/fallback logic

Keep:
- File type and size validation
- Extracted data preview UI
- Driver/truck matching logic
- All the existing UI components

### File: `supabase/functions/parse-rate-confirmation/index.ts`

Simplify CORS to use wildcard (matches the working `manage-credentials` pattern):

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

No other changes needed -- the `filePath` code path already works.

### Why This Will Work
- Storage uploads use the Supabase REST API endpoint (`/storage/v1/...`), which works from the published site (document uploads already use this)
- The edge function call sends only `{ filePath: "temp-rc/..." }` -- a ~50 byte JSON body that the relay can handle
- The edge function's existing `filePath` handler downloads from storage, processes with AI, and cleans up the temp file automatically

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- storage-first upload, simplified error handling
- `supabase/functions/parse-rate-confirmation/index.ts` -- simplified CORS headers
