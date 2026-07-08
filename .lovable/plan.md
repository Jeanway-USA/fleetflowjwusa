# Restore public shipment tracking

## Problem
`src/App.tsx` redirects `/track` → `/auth`, and `src/pages/PublicLoadTracker.tsx` was deleted. But the app still hands out `/track?tracking_id=…` links to external recipients (no accounts):

- `src/components/driver/ActiveLoadCard.tsx` (Copy tracking link)
- `src/pages/FleetLoads.tsx` (Tracking ID column copy)
- `supabase/functions/email-load-status/index.ts` ("View Load Details" button)
- `supabase/functions/send-invoice-email/index.ts` ("View Load Details" button)

Recipients hit the sign-in wall → tracking flow is broken end-to-end.

## Decision needed
Pick one:
1. **Restore public tracker** (recommended). Re-create a minimal `PublicLoadTracker.tsx` that reads `tracking_id` from the URL and shows read-only load status (stops, ETA, current status, last GPS ping timestamp) via a public RPC / RLS policy limited to `tracking_id` lookups. Restore the route `<Route path="/track" element={<PublicLoadTracker />} />` in `App.tsx`.
2. **Kill the public tracking flow**. Remove all outgoing `/track?tracking_id=…` link generation from the four call sites above and drop the "View Load Details" button from the two edge functions.

## Proposed implementation (option 1)
1. Add `src/pages/PublicLoadTracker.tsx`:
   - Read `tracking_id` from `useSearchParams`.
   - Call a security-definer RPC `public.get_public_load_by_tracking(tracking_id uuid)` returning only non-sensitive fields (load number, status, origin/destination city+state, pickup/delivery windows, last driver location timestamp, ETA). No rates, no broker PII, no driver name.
   - Render read-only card with a status timeline. Handle "not found" and "delivered/expired" states.
2. Migration: create the RPC (SECURITY DEFINER, `SET search_path = public`), granting `EXECUTE` to `anon, authenticated`. Do not add broad RLS SELECT to `anon`.
3. `src/App.tsx`: replace the `Navigate` with `<Route path="/track" element={<PublicLoadTracker />} />` outside `ProtectedRoute`.
4. Verify the four link-generation sites still produce the expected URL; no changes needed.
5. Add a lightweight CSP/robots note if desired (noindex meta on the page).

## Verification
- Copy a tracking link while signed out in an incognito window → page loads with status.
- Trigger `email-load-status` in staging → button opens the public page for a non-authed recipient.
