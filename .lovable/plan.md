

## Fix: Documents Page for Google Drive Users

### Problem
When an organization uses Google Drive storage, the Documents page is broken in two ways:
1. **DocumentViewer component** uses built-in storage signed URLs (`getSignedUrl`) which fail for `gdrive:` file paths — files can't be viewed or downloaded.
2. **Documents page** shows no indication of Google Drive being active and provides no way to browse the Drive folder.

### Changes

**1. `src/components/shared/DocumentViewer.tsx`** — Make provider-aware
- Replace direct `getSignedUrl`/`extractStoragePath` calls with `getFileUrl` from `useStorageProvider`.
- For `gdrive:` files, `getFileUrl` returns a proxy URL that requires auth — fetch via the storage proxy download endpoint with the user's auth token, then open/download the resulting blob.
- For built-in storage files, behavior stays the same.

**2. `src/pages/Documents.tsx`** — Add Google Drive context
- Import and use `useStorageStatus` to detect when Google Drive is active.
- When Google Drive is active, show:
  - A banner/card at the top indicating files are stored in Google Drive.
  - A "Open in Google Drive" button linking to the root folder (fetch `root_folder_id` from storage config query).
  - The existing document table still works (records come from the `documents` DB table regardless of storage provider) — but now the View/Download buttons will work via the proxy.
- Upload still works as-is (already uses `useStorageProvider`).

**3. `src/components/shared/DocumentViewer.tsx`** — Handle authenticated proxy download
- For `gdrive:` paths: call the storage-proxy `download` endpoint with the user's Bearer token, receive the file blob, then open it in a new tab (view) or trigger a download.
- For built-in paths: continue using signed URLs as before.

### Files
| File | Change |
|------|--------|
| `src/components/shared/DocumentViewer.tsx` | Use `getFileUrl` from storage provider; handle `gdrive:` proxy downloads with auth |
| `src/pages/Documents.tsx` | Add Google Drive status banner with "Open in Google Drive" link when active |

