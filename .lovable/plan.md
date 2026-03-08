

## Always Use Built-in Storage for Branding Assets

### Problem
BrandingTab uses `useStorageProvider()` which routes uploads through Google Drive when configured. Branding assets (logo/banner) need to always be available — Google Drive auth tokens can expire, making the logo disappear from the sidebar.

### Fix
Replace the storage-provider-aware calls in `BrandingTab.tsx` with direct built-in storage calls (`supabase.storage`), and replace `useProviderSignedUrl` with the direct `useSignedUrl` hook. Same for `AppSidebar.tsx` — it already uses `useSignedUrl` directly, so no change needed there.

### Changes

**`src/components/settings/BrandingTab.tsx`**
- Remove `useStorageProvider` and `useProviderSignedUrl` imports
- Import `useSignedUrl` from `@/hooks/useSignedUrl` instead
- Replace `useProviderSignedUrl('branding-assets', ...)` with `useSignedUrl('branding-assets', ...)`
- Replace `storageUpload(...)` with direct `supabase.storage.from('branding-assets').upload(filePath, file, { upsert: true })`
- Replace `storageRemove(...)` with direct `supabase.storage.from('branding-assets').remove([path])`

No other files need changes — `AppSidebar.tsx` already uses `useSignedUrl` directly.

### Files Modified
| File | Action |
|---|---|
| `src/components/settings/BrandingTab.tsx` | Use direct built-in storage instead of provider proxy |

