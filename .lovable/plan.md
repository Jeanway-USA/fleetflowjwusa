## Problem

The completed-PDF card is stuck on "Assembling the final PDF…" forever. Two issues combine:

1. **pdfjs worker not configured.** Setting `GlobalWorkerOptions.workerSrc = ''` does NOT disable the worker in modern pdfjs-dist — `getDocument()` still tries to spin one up and throws "No 'GlobalWorkerOptions.workerSrc' specified" (visible in the session replay). `composeCompletedPdf` rejects before uploading, so `pdf_storage_path` is never set.
2. **UI has no failure state.** `DocumentSigningWorkspace` shows the spinner whenever `status === 'completed'` and `pdf_storage_path` is null. When the compose promise rejects, the toast fires once but the effect's dependency array (`instance.pdf_storage_path`) doesn't change, so nothing re-triggers and the spinner stays forever. Refreshing re-runs the same broken call.

## Fix

### 1. Give pdfjs a real worker (Vite-native)

In `src/lib/documents/composeCompletedPdf.ts`, replace the `workerSrc = ''` hack with a Vite `?url` import of the bundled worker:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

This is the standard pattern for pdfjs in Vite and eliminates the "workerSrc not specified" error. No other logic in `composeCompletedPdf` needs to change.

### 2. Recover from failures in the signing workspace

In `src/pages/DocumentSigningWorkspace.tsx`:

- Track a local `composeError: string | null` alongside `composing`.
- On compose failure, set `composeError` (in addition to the existing toast).
- Change the "completed but no pdf_storage_path" branch of the card so it renders:
  - the spinner + "Assembling…" while `composing === true` and no error
  - an error message + "Retry" button when `composeError` is set; clicking clears the error and re-invokes `composeCompletedPdf(instance.id)`
- Keep the automatic first attempt as-is so the happy path is unchanged.

### 3. Reset the stale row so the retry has a clean slate

The current instance already went through the broken compose path. Its `pdf_storage_path` is still null, which is fine — the fixed worker will let the next attempt (auto on reload, or via the new Retry button) upload successfully.

No database migration required for this fix.

## Files touched

- `src/lib/documents/composeCompletedPdf.ts` — swap workerSrc line for the `?url` import pattern.
- `src/pages/DocumentSigningWorkspace.tsx` — add `composeError` state, render retry UI, wire up retry handler.
