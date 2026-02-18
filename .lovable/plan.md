

## Fix: CORS blocking Landstar Statement uploads

### Problem
The `parse-landstar-statement` edge function has a custom CORS allowlist that only permits `*.lovable.app` origins. However, the preview site now serves from `*.lovableproject.com`, causing the browser to block the request entirely ("Failed to fetch").

### Solution
Update the CORS configuration in `supabase/functions/parse-landstar-statement/index.ts` to also allow `*.lovableproject.com` origins, matching the pattern used in the memory notes for other hardened edge functions.

### Technical Details

**File:** `supabase/functions/parse-landstar-statement/index.ts`

- Add `*.lovableproject.com` to the origin check in the `getCorsHeaders` function (around line 16):
  ```typescript
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')
  );
  ```

This is a one-line change that fixes the CORS mismatch for both preview and published URLs.

