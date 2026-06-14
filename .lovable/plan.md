## Goal
Make `DocumentScanButton` survive cell-signal loss: when offline, the compressed image is stored locally and the UI shows "Queued for Upload". When the browser fires `online`, the queue auto-drains to Supabase storage + `documents` table, and the chip flips to a green "Uploaded" check.

## Why IndexedDB (not localStorage)
A compressed BOL is ~400–800 KB. localStorage has a ~5 MB origin cap and only stores strings, so a base64 round-trip inflates each file by ~33% and a single bad upload could fill the quota. IndexedDB stores `Blob` objects natively (no base64), has effectively no relevant cap for our use, and is the standard PWA pattern. Existing `useOfflineQueue` keeps doing what it does — small JSON actions stay in localStorage.

## Changes

### 1. New `src/lib/offline-document-queue.ts`
Native IndexedDB wrapper (no new dependency).

- DB: `lovable-doc-queue`, version 1, object store `documents`, keyPath `id`.
- Record shape:
  ```ts
  interface QueuedDocument {
    id: string;            // crypto.randomUUID()
    blob: Blob;            // already-compressed file
    fileName: string;
    mimeType: string;
    fileSize: number;
    documentType: string;  // bol | fuel_receipt | ...
    driverId: string;
    uploadedBy: string;    // user.id
    relatedType: 'driver';
    relatedId: string;
    relatedLoadId?: string | null;
    queuedAt: number;
    attempts: number;
    lastError?: string;
  }
  ```
- Exports: `openDocQueueDb`, `enqueueDocument`, `listQueuedDocuments`, `removeQueuedDocument`, `incrementAttempt`, `countQueued`.
- Gracefully no-ops when `indexedDB` is unavailable (private-mode Safari fallback → throws so caller can surface the error).

### 2. New `src/hooks/useOfflineDocumentQueue.ts`
Hook mirroring the structure of `useOfflineQueue` but for document blobs.

- State: `isOnline`, `queuedCount`, `isSyncing`, plus a `lastSyncedAt`.
- `enqueue(record)`: persists to IndexedDB, updates `queuedCount`, toasts "Queued — safe to drive".
- `syncAll()`:
  - Single-flight guard (ref).
  - For each queued record: upload Blob via `useStorageProvider().upload('documents', `${driverId}/${Date.now()}-${id}.${ext}`, file)`, then insert into `documents` table with the stored metadata. On success, `removeQueuedDocument(id)`. On failure, `incrementAttempt(id, err)`; stop the loop only on auth errors (so a single bad doc doesn't block others — same pattern as existing queue).
  - Toast summary on completion ("Uploaded N queued document(s)").
- Listens to `window 'online'` to invoke `syncAll`, and runs `syncAll()` on mount if `navigator.onLine && queuedCount > 0`.

### 3. Mount global sync bootstrap
- New tiny component `src/components/shared/DocumentSyncBootstrap.tsx` that just calls `useOfflineDocumentQueue()` so the listener is always active for signed-in users.
- Mount it in `App.tsx` next to the existing global `OfflineIndicator`/auth-gated providers so drivers don't need the upload dialog open for the queue to drain.

### 4. Update `src/components/driver/DocumentScanButton.tsx`
Submit handler becomes:

```text
1. Compress (already done after Quality Gate confirm).
2. If !navigator.onLine:
     enqueueDocument({...compressed blob, metadata})
     toast "Queued for upload — safe to close & drive"
     close dialog, reset form
3. Else:
     try storage upload + documents insert (existing path)
     on network/transient error (offline mid-flight, fetch TypeError,
       status 0/5xx) → fall back to enqueueDocument and toast queued.
     otherwise → bubble error as today.
```

Also surface queue state inside the dialog header:
- Pull `{ queuedCount, isSyncing, isOnline }` from `useOfflineDocumentQueue`.
- Small chip rendered above the Doc Type select:
  - `queuedCount > 0 && (!isOnline || !isSyncing)` → yellow chip, `CloudOff` icon, text "N queued for upload".
  - `isSyncing` → yellow chip, spinning `RefreshCw`, text "Uploading queued documents…".
  - Just-finished (no queue, recently synced) → green chip, `CheckCircle2`, text "All documents uploaded" (auto-hides after ~4s).
- Reuse the amber-500 / primary tokens already used by `OfflineIndicator` for visual consistency.

### 5. Storage / RLS / schema
No backend changes. The existing `documents` bucket policy (driver writes to `${driverId}/...`) already permits the queued upload path. No new tables.

## Out of scope (explicitly)
- Background Sync API (`registration.sync.register`) — requires an installed service worker; the project's PWA guidance reserves SWs for offline-shell only. The plain `online` event is sufficient for our "driver returns to coverage and opens the app" flow.
- Migrating the existing fuel-receipt/load-status localStorage queue to IndexedDB — leave as is.
- Retrying uploads of legacy in-flight uploads that died before this change ships.

## Verification
- DevTools → set Network to Offline, tap Scan Doc → Take Photo → Quality Gate confirm → Upload. Expect yellow "Queued for Upload" chip and toast; nothing in network tab.
- Close + reopen the dialog: queued chip still shows correct count.
- Set Network back to Online. Within seconds: green "All documents uploaded" chip, row appears in `documents` table, file appears in `documents` bucket at `${driverId}/...`.
- Throttle to "Slow 3G" with a forced fetch failure: confirms the online-path fallback enqueues instead of erroring out.
- Refresh app while offline with items queued: queue survives reload (IndexedDB), drains when back online.
