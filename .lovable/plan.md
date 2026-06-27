## Why "Current Load" disappears on mobile

On mobile (especially iOS Safari) something inside the lazy-loaded map / live-route subscription that `ActiveLoadCard` renders throws an error whose message contains `websocket` or `insecure` (mixed-content tile fetch or a wss handshake failure). The `<ErrorBoundary compact>` that wraps the whole card catches it and — because the message matches `/websocket|insecure/i` — replaces the **entire Active Load card** with the small gray strip:

> "Live updates aren't available in this browser. Pull to refresh to see the latest."

That's why you only see `UP NEXT (PRE-PLAN)` below it, and why a refresh never helps: the same render path keeps throwing. Desktop Chrome doesn't trip the same throw, so the card renders normally there.

## Fix (UI only, no DB)

### 1. `src/components/shared/ErrorBoundary.tsx`
- Always `console.error('[ErrorBoundary]', error, errorInfo)` before rendering the fallback, so the real underlying error stack stops being hidden by the friendly banner.
- Stop letting the "websocket / insecure" banner shadow the wrapped component. Render it as a small **footer notice underneath** `this.props.children` when a non-fatal WS/insecure-only error is caught, instead of replacing the children entirely. If the error is anything else, keep current compact error UI.

### 2. `src/components/driver/ActiveLoadCard.tsx`
- Move the live-route / map subscription out of the main render tree of the card:
  - Wrap the lazy `LoadRouteMap` `<Suspense>` block in its own **local** `<ErrorBoundary compact>` so a map/Leaflet/tile failure can no longer take down stop info, status buttons, pay, POD, etc.
  - If `LoadRouteMap` fails, render a tiny "Map unavailable on this connection" placeholder in that slot only.

### 3. `src/hooks/useActiveLoadRoute.ts`
- Guard the realtime subscription so a `wss` handshake failure can never bubble out of the hook: wrap `supabase.channel(...).subscribe(...)` in `try/catch`, and pass a status callback that just `console.warn`s on `CHANNEL_ERROR` / `TIMED_OUT` instead of throwing. The initial REST fetch already works fine without realtime.

### 4. `src/pages/DriverDashboard.tsx` and `src/pages/DriverSpectatorView.tsx`
- No logic change — both already share `useDriverHomeData`, so parity stays intact. The fix above restores the Current Load card on both surfaces simultaneously on mobile.

## Verification

After the change, on the same mobile browser:
- The Active Load card for the `in_transit` load renders with route, stops, pay, and POD button.
- If the embedded map can't load, only the map area shows a small "Map unavailable" placeholder; the rest of the card stays usable.
- Console shows the actual original error (was previously hidden), so any remaining mobile-only issue is diagnosable in one more pass.

Out of scope: no changes to RLS, DB schema, the shared `useDriverHomeData` query, Audit Trail, or Executive portal.