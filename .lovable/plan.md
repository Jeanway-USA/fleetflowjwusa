

## Fix Logo on Public Tracking Page

### Problem
The `logo_url` stored in `organizations` is now a private storage path (e.g., `a0000000-.../logo.png`), not a URL. The public tracking page has no auth session, so it can't generate a signed URL client-side. The edge function already has the service role key and can generate the signed URL server-side.

### Fix — `supabase/functions/public-load-tracker/index.ts`
After fetching the org data, if `logo_url` exists and doesn't start with `http`, generate a signed URL using `supabase.storage.from('branding-assets').createSignedUrl(logo_url, 3600)` and replace `logo_url` in the response with the full signed URL.

Same treatment for `banner_url` if it's ever used.

### Files Modified
| File | Action |
|---|---|
| `supabase/functions/public-load-tracker/index.ts` | Generate signed URL for logo_url server-side before returning |

