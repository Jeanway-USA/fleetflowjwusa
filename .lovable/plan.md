## Goal
Hide public-facing marketing UI. Root URL sends visitors straight to Sign-In. No DB, RLS, roles, or org data touched.

## Changes (frontend only)

### 1. `src/App.tsx` — routing
- Root `/`: when unauthenticated, redirect to `/auth` instead of rendering `Landing`. When authenticated, keep current role-based redirect behavior.
  - Simplest: replace `<Route path="/" element={<RoleBasedRedirect />} />` with a small wrapper that returns `<Navigate to="/auth" replace />` for signed-out users, otherwise delegates to `RoleBasedRedirect`. Alternatively, edit `RoleBasedRedirect.tsx` to `return <Navigate to="/auth" replace />` in place of `return <Landing />`.
- Remove these public routes entirely (they will 404 via existing `*` NotFound):
  - `/landing`, `/pricing`, `/track`, `/about`, `/contact`
- Remove the corresponding `lazy(() => import(...))` lines for `Landing`, `Pricing`, `PublicLoadTracker`, `About`, `Contact`.
- Keep `/privacy` and `/terms` (legal pages required for auth/compliance) — confirm if you want these removed too.
- Keep `/auth`, `/reset-password`, `/auth/accept-invite`, `/onboarding`, `/pending-access`, `/account-deactivated`, `/checkout-success` untouched.

### 2. `src/pages/Auth.tsx` — scrub marketing links
- Remove any links / buttons pointing to `/landing`, `/pricing`, `/about`, `/contact`, `/track`, or public signup CTAs.
- Keep sign-in, password reset, and invite-acceptance flows. Ensure JeanWay logo + branding remain.
- (Will read the file in build mode to enumerate exact links to strip.)

### 3. Delete marketing page files
- `src/pages/Landing.tsx`
- `src/pages/Pricing.tsx`
- `src/pages/PublicLoadTracker.tsx`
- `src/pages/About.tsx`
- `src/pages/Contact.tsx`
- Remove any now-orphaned imports these pages pulled in (only if not used elsewhere — verified via `rg` before deletion).

### 4. `src/components/shared/RouteTitle.tsx`
- Drop `/landing`, `/pricing`, `/track`, `/about`, `/contact` entries from `SELF_TITLED` set since the pages no longer exist.

### 5. `index.html` / `public/sitemap.xml` / `public/robots.txt`
- Remove marketing URLs from `sitemap.xml` if listed. Leave meta tags alone unless they reference removed pages.

## Explicitly NOT touched
- Any database table, column, row, RLS policy, migration, edge function.
- `user_roles`, `organizations`, `profiles`, or any auth data.
- Dashboards, sidebar, ProtectedRoute logic, role-home routing for signed-in users.

## Open questions
1. Keep `/privacy` and `/terms` reachable (legal requirement, usually linked from Auth footer)? Default: keep.
2. Keep `/track` (public load tracker used by brokers/customers via shared link)? You listed it for removal — will delete unless you say otherwise.
