
# Fix: Rate Confirmation Upload Failing on Published Site

## Problem
The "Failed to fetch" error occurs only on the published (live) site because the code uses a raw `fetch()` call directly to the Supabase URL. On the published site, Lovable Cloud routes edge function calls through a relay/proxy. All other edge functions in the codebase use `supabase.functions.invoke()` which automatically routes through this relay -- but `parse-rate-confirmation` bypasses it.

## Root Cause
In the previous fix, we switched from `supabase.functions.invoke()` to raw `fetch()` to support sending the PDF as binary. However, the direct Supabase URL is not accessible from the published domain, causing a network-level failure ("Failed to fetch").

## Solution
Switch back to using `supabase.functions.invoke()` but pass the raw `File` object as the body with the correct `Content-Type` header. The Supabase JS SDK supports non-JSON bodies (Blob, File, ArrayBuffer) and will route through the relay automatically.

## Technical Details

### File: `src/components/loads/RateConfirmationUpload.tsx`

Replace the raw `fetch()` call:
```typescript
// CURRENT (broken on live):
const response = await fetch(`${supabaseUrl}/functions/v1/parse-rate-confirmation`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'apikey': anonKey,
    'Content-Type': 'application/pdf',
  },
  body: file,
});
```

With `supabase.functions.invoke()`:
```typescript
// NEW (works on both preview and live):
const { data, error: fnError } = await supabase.functions.invoke('parse-rate-confirmation', {
  body: file,
  headers: { 'Content-Type': 'application/pdf' },
});
```

- Remove the manual session refresh, URL construction, and raw fetch logic
- Remove the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` references
- Handle the SDK response format (`data`/`error`) instead of raw Response parsing
- Keep the rest of the component (extracted data preview, matching logic) unchanged

### File: `supabase/functions/parse-rate-confirmation/index.ts`
No changes needed -- the edge function already handles `application/pdf` content type.

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- Switch from raw fetch to SDK invoke
