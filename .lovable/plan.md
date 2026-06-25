## Make `useDocumentUpload` offline-first (POD + general document attach)

### Context — what already works
- **IndexedDB queue**: `src/lib/offline-document-queue.ts` stores Blobs (not base64) keyed by UUID — already implemented.
- **Sync observer**: `useOfflineDocumentQueue` watches `online`/`offline`, auto-drains to Supabase Storage + `documents` table, fires success/error toasts.
- **Global bootstrap**: `<DocumentSyncBootstrap />` is mounted inside `DashboardLayout`, so the observer runs on every authenticated page (driver and back-office).
- **Driver scan/POD flow** (`DocumentScanButton.tsx`) is already offline-first: detects `!navigator.onLine`, enqueues, and surfaces a "queued — safe to drive" toast plus a synced badge.

### Gap to close
`useDocumentUpload.uploadDocument` (used by the shared `<DocumentUpload />` component on Drivers, Trucks, Trailers pages and any in-app POD attach UI that isn't the driver scan button) still calls Storage directly and `toast.error`'s on network failure — so a dead-zone POD attempt crashes the flow instead of queueing.

### Changes

**1. `src/hooks/useDocumentUpload.ts` — wrap uploads with a connectivity guard**
- Inject the existing offline queue (`enqueueDocument` from `@/lib/offline-document-queue`) directly — keep the hook independent of `useOfflineDocumentQueue` to avoid extra subscriptions per call site.
- New flow in `uploadDocument(file, options)`:
  1. Get current user (still required for `uploaded_by`).
  2. If `!navigator.onLine` **or** IndexedDB is supported and the file is an image/PDF that should survive disconnects → `enqueueDocument(...)` immediately, dispatch the existing `lovable:doc-queue-changed` event, toast `"Saved offline — will upload when signal returns"`, return.
  3. Otherwise attempt the live `upload(...)` → `supabase.insert(...)` chain inside a try/catch.
  4. On network-shaped failures (`TypeError: Failed to fetch`, `err.message` containing `network`/`fetch`, or `!navigator.onLine` after the throw) → fall back to `enqueueDocument` instead of `toast.error`. Same "saved offline" toast.
  5. Only show `toast.error` for true validation/auth errors (HTTP 4xx with a server message).
- Keep `documentType`, `relatedType`, `relatedId`, `org_id`, `uploaded_by` on the queued record so the existing drain logic in `useOfflineDocumentQueue` writes the same `documents` row when it eventually syncs.

**2. `src/components/shared/DocumentUpload.tsx` — surface queue state**
- Consume `useOfflineDocumentQueue()` (read-only: `isOnline`, `queuedCount`, `isSyncing`).
- Add a small inline status pill above the file input:
  - `Offline — new attachments will queue` (amber) when `!isOnline`
  - `Syncing N queued…` (blue, with spinner) when `isSyncing`
  - Hidden otherwise
- No behavior change beyond the visual indicator — the hook already handles the actual queue/drain.

**3. Toast copy + crash safety**
- Replace the generic `toast.error(error.message)` in the upload catch with the offline-aware branching above. Re-throw only when the caller (mutation) still needs to know about a non-recoverable error; for queued-instead-of-failed cases, resolve cleanly so the dialog closes normally.

### Out of scope
- No DB schema, RLS, or Storage bucket changes (queue already drains into the existing `documents` table + `documents` bucket).
- No new dependencies.
- No changes to `DocumentScanButton` (already offline-first).
- No service-worker / Background Sync API work — the in-app `online` listener + bootstrap already covers reconnect drain while the tab is open.

### File touch list
- **edit** `src/hooks/useDocumentUpload.ts` — connectivity guard + queue fallback
- **edit** `src/components/shared/DocumentUpload.tsx` — offline/sync status pill