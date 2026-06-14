# Public tracking link — already unauthenticated end-to-end

## What I found in the codebase

I traced the full tracking-link path (route → component → data fetch → database) and every layer is already public. There is nothing to change to make `/track` reachable without a login.

### 1. Route is already outside `ProtectedRoute`
`src/App.tsx` line 103, in the "Public routes" block (above the protected dashboards):

```tsx
<Route path="/track" element={<PublicLoadTracker />} />
```

`ProtectedRoute` only wraps the dashboards below it; `/track` is rendered straight from `AuthProvider` with no role/auth gate.

### 2. `PublicLoadTracker` does not use `useAuth` or redirect to `/auth`
`src/pages/PublicLoadTracker.tsx` reads `tracking_id` from the URL query and `fetch`es the public edge function with no Authorization header and no session check. There is no `useAuth`, no `navigate('/auth')`, no `<ProtectedRoute>` in this file. It renders cleanly for anonymous visitors.

### 3. Database is fetched server-side, not from the browser
Anonymous visitors never hit the `fleet_loads` table directly with the anon key. The component calls the `public-load-tracker` edge function:

- `supabase/config.toml` sets `verify_jwt = false` for the function, so it accepts unauthenticated requests.
- `supabase/functions/public-load-tracker/index.ts` uses the **service role** key, looks up the row by `tracking_id` only, and returns a narrowed JSON shape (origin/destination condensed to city+state, status, dates, miles, org branding, current GPS location). Other columns on `fleet_loads` are never exposed.
- RLS on `fleet_loads` is bypassed by service role — this is the intentional pattern and is safer than opening a public anon SELECT policy, because the edge function controls exactly which columns leave the database and only ever returns one row keyed by the random `tracking_id` token.

The tracking URL generators in `src/pages/FleetLoads.tsx` and `src/components/driver/ActiveLoadCard.tsx` produce links in the form `${origin}/track?tracking_id=<uuid>`, which match the route above.

### 4. No RLS policy change is needed (and adding one would be a regression)
Granting `SELECT` on `fleet_loads` to the `anon` role — even scoped to `tracking_id` — would widen Data-API surface area: any column on the row becomes reachable from the browser with the anon key, including financial fields (`rate`, `gross_revenue`, `net_revenue`, `settlement`, broker info, etc.) and PII like driver assignments. The current edge-function-with-service-role pattern intentionally hides those columns. Task 3 as written would be a downgrade, not an improvement.

## Recommended action

No code or migration changes. To verify, open an incognito window and visit any link printed by the "Copy tracking link" button — the tracker should render with map, status stepper, and ETA without ever prompting for login. If you are still being bounced to `/auth`, it is almost certainly one of:

- The link was opened on a path other than `/track?tracking_id=...` (e.g. someone pasted just the UUID into `/track/:id`). I can add a `/track/:trackingId` alias if your customers share links that way.
- A stale service worker cached an old build that didn't have the public route. A hard refresh (or bumping the SW version) clears that.

If you'd like, tell me which URL the broker tried and I'll add the matching public alias or SW bust in the next pass.
