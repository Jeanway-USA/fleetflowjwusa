# Fix "WebSocket not available: The operation is insecure" on Driver Dashboard

## Root cause

The error is thrown by Supabase Realtime (`@supabase/supabase-js`) when the browser refuses to open a WebSocket. On `tms.jeanwayusa.com` the driver was almost certainly using an **in-app browser** (Instagram/Facebook/Gmail webview) or a privacy-hardened mobile browser. In those environments `new WebSocket(...)` throws a `SecurityError: The operation is insecure`, and supabase-js re-throws it from `.channel(...).subscribe()`.

`DriverNotifications` already wraps the call in `try/catch`, but **`DriverMessages` does not** — its `subscribe()` throws synchronously, the render bubbles into the surrounding `ErrorBoundary`, and the user sees the red "Something went wrong loading this section" banner in the dashboard header.

Other components on the driver dashboard (`useDriverMaintenanceRequests`, `MaintenanceRequestCard`, etc.) and a few dispatcher components have the same unguarded pattern and will crash the same way for any user on a websocket-blocked browser.

Importantly: **realtime is only a "nice to have"** here — every query already refetches on mount/visibility change. Losing realtime should silently downgrade to polling-on-focus, not break the page.

## Plan

### 1. New helper: `src/lib/safe-channel.ts`
Tiny wrapper that creates a Supabase channel inside `try/catch` and returns `null` if the WS handshake throws. Also returns a no-op cleanup so call sites don't need their own null-check ceremony.

```ts
export function safeChannel(name: string, build: (ch) => ch) { ... }
// returns { channel, cleanup }
```

When it catches `SecurityError` / "WebSocket" / "insecure", it logs once via `console.warn` (not error) so the ErrorBoundary is never triggered.

### 2. Wrap existing realtime call sites
Apply `safeChannel` (or a localized `try/catch` mirroring `DriverNotifications`) to:

- `src/components/driver/DriverMessages.tsx` (the actual culprit in the screenshot)
- `src/hooks/useDriverMaintenanceRequests.ts`
- `src/hooks/useMaintenanceThread.ts`
- `src/hooks/usePMNotifications.ts`
- `src/components/drivers/DriverChatSheet.tsx`
- `src/components/dispatcher/DispatcherAlerts.tsx`
- `src/components/dispatcher/ActiveLoadsBoard.tsx`
- `src/components/dispatcher/FleetMapView.tsx`
- `src/pages/DispatcherDashboard.tsx`

No behavior change when WebSockets work; on failure each component just skips realtime and keeps relying on the existing TanStack Query refetch.

### 3. Friendlier ErrorBoundary copy (optional, low risk)
In `src/components/shared/ErrorBoundary.tsx` (compact mode), detect error messages containing `WebSocket` / `insecure` and render a small muted notice ("Live updates unavailable in this browser") instead of the red "Try Again" banner. Prevents future regressions from looking alarming.

## Out of scope
- No changes to Supabase client config, auth, or RLS.
- No changes to query/refresh intervals.
- Won't "enable" realtime in in-app browsers — that's a browser limitation; goal is just to prevent the crash.

## Manual verification after build
1. Open driver dashboard normally in Chrome/Safari → header is clean, realtime still works.
2. Open in an in-app browser (or Firefox with strict ETP) → no red error banner; console shows a single "Realtime unavailable" warning.
