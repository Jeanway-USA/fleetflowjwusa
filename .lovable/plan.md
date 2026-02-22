

## Plan: Fix Branding Assets to Use Google Drive

### The Situation

The `BrandingTab` component already uploads via `useStorageProvider`, which correctly routes to Google Drive when connected. However, there are two issues:

1. **Display is broken for Google Drive files** -- the component uses `useSignedUrl` (built-in storage only) to display the logo and banner. If the file path is `gdrive:...`, `useSignedUrl` won't resolve it. It needs to use `useProviderSignedUrl` instead.

2. **The `organizations` table stores `logo_url` and `banner_url`** -- these are separate from the `documents` table. The migration action already handles `company_settings` but needs to also handle `organizations.logo_url` and `organizations.banner_url` columns.

### Changes

| File | Change |
|------|--------|
| `src/components/settings/BrandingTab.tsx` | Replace `useSignedUrl` with `useProviderSignedUrl` from `useStorageProvider` so that `gdrive:` paths resolve correctly |
| `supabase/functions/storage-proxy/index.ts` | Add `organizations.logo_url` and `organizations.banner_url` to the migrate action so existing branding assets get moved to Google Drive during migration |

### Technical Details

**BrandingTab.tsx:**
- Replace `import { useSignedUrl }` with `import { useProviderSignedUrl }` from `@/hooks/useStorageProvider`
- Change `useSignedUrl('branding-assets', logoUrl)` to `useProviderSignedUrl('branding-assets', logoUrl)`
- Change `useSignedUrl('branding-assets', bannerUrl)` to `useProviderSignedUrl('branding-assets', bannerUrl)`
- This ensures that when the stored path is `gdrive:...`, the proxy is used to fetch the image

**storage-proxy/index.ts (migrate action):**
- Add a new section in the migrate handler that queries the `organizations` table for `logo_url` and `banner_url` where the org matches and the path does NOT start with `gdrive:`
- For each branding asset found, download from `branding-assets` bucket, upload to Google Drive under a `branding-assets` subfolder, update the column to `gdrive:{id}`, and delete from built-in storage

