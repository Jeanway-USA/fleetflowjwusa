## Context

`src/App.tsx` already wraps `<Suspense>` in `<ErrorBoundary>`, and `src/components/shared/ErrorBoundary.tsx` exists. The real gap is that the boundary doesn't distinguish **chunk loading errors** (thrown by `React.lazy` when a dynamic `import()` fails — typically after a redeploy invalidates old hashed JS files in the user's tab) from generic render crashes. Today the user sees "Try Again", clicks it, the same broken chunk is requested again, and it fails again — effectively a soft white screen.

## Goal

Detect chunk load failures and recover via a **hard reload** (`window.location.reload()`), which fetches fresh `index.html` with new chunk hashes. Keep current behavior for non-chunk render errors.

## Changes

### 1. `src/components/shared/ErrorBoundary.tsx`
- Add a `isChunkLoadError(error)` helper that matches:
  - `error.name === 'ChunkLoadError'`
  - `/Loading chunk [\d]+ failed/i`
  - `/Failed to fetch dynamically imported module/i`
  - `/Importing a module script failed/i` (Safari)
- In `componentDidCatch`, if it's a chunk error and we haven't already retried this session, set `sessionStorage['chunk-reload-attempted'] = '1'` and call `window.location.reload()` automatically (one-shot, so we don't infinite-loop on a genuinely broken deploy).
- Render a dedicated fallback when `isChunkLoadError` is true (and the auto-reload already fired once):
  - Friendly copy: "A new version of the app is available. Please reload to continue."
  - Primary button: **Reload page** → `window.location.reload()` (clears the sessionStorage flag first).
  - Secondary: small muted line with the error message for debugging.
- Keep existing compact + generic fallbacks untouched for non-chunk errors.

### 2. `src/App.tsx`
- No structural change needed — `<ErrorBoundary>` already wraps `<Suspense>`. Confirm placement stays outside `<Suspense>` so suspense fallback still renders during normal lazy loads.

## Out of scope

- Resetting the boundary on route change (separate concern; current behavior is acceptable since chunk recovery is a full reload anyway).
- Service-worker cache busting (project intentionally has no SW per recent memory updates).
- Telemetry/Sentry reporting.

## Verification

1. Run dev preview, navigate to `/executive-dashboard` — no regression, page loads.
2. Simulate chunk error: in DevTools, throw `const e = new Error('Loading chunk 42 failed'); e.name = 'ChunkLoadError'; throw e;` from a lazy page, confirm one auto-reload fires, then on second occurrence the friendly "Reload page" UI appears with a working button.
3. Throw a generic `throw new Error('boom')` from a page — confirm existing "Something went wrong" fallback still shows (no auto-reload).