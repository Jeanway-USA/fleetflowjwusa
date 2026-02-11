

# Fix: Rate Confirmation Upload on Published Site

## Problem
The `supabase.functions.invoke()` call with a raw `File` body fails on the published site. The Lovable Cloud relay does not correctly forward raw binary bodies -- it likely serializes or wraps them in a way the edge function cannot read, resulting in "Failed to send a request to the Edge Function."

## Why Previous Approaches Failed
1. **Raw `fetch()` to Supabase URL** -- blocked by the relay on published domain ("Failed to fetch")
2. **`supabase.functions.invoke()` with raw File body** -- relay corrupts binary body ("Failed to send a request")
3. **Storage upload then invoke** -- storage upload returns HTML on live ("Unexpected token '<'")

## Solution: Base64 in JSON Body
Convert the PDF to base64 on the client side and send it as a standard JSON payload via `supabase.functions.invoke()`. This uses the normal SDK path through the relay with a standard JSON `Content-Type`, which is proven to work for all other edge function calls in the app.

Rate confirmation PDFs are typically 50-200KB, which converts to ~70-270KB base64. This is well within the JSON payload limits.

## Technical Details

### 1. Update `src/components/loads/RateConfirmationUpload.tsx`
- Add a helper function to read a `File` as base64 using `FileReader`
- Replace the current invoke call:
  ```typescript
  // Convert file to base64 on client
  const base64 = await fileToBase64(file);
  
  const { data, error } = await supabase.functions.invoke('parse-rate-confirmation', {
    body: { pdfBase64: base64 },
  });
  ```
- Remove the custom `Content-Type: application/pdf` header so the SDK uses its default `application/json`

### 2. Edge Function -- No Changes Needed
The edge function already handles `pdfBase64` in a JSON body (lines 232-233 of the current code). This is the "backward compat" path that was kept from a previous iteration. It will work as-is.

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- Convert file to base64 client-side, send as JSON

