## Problem

`src/pages/Auth.tsx` sets the tab title to "Sign In or Join the Free Beta — FleetFlow TMS" via `react-helmet-async`. Once a user signs in and navigates into the app (Executive Dashboard, Finance, Fleet Loads, etc.), none of those authenticated pages render their own `<Helmet>`, so Helmet has nothing to swap the title to and the Auth-page title stays pinned in the browser tab. Only the handful of public pages with Helmet (Landing, Pricing, About, Contact, Privacy, Terms, 404, Reset, Accept Invite, Public Tracker) update the title correctly.

## Fix

Add one small route-aware title component that runs inside the Router and renders a `<Helmet>` with a title derived from the current pathname. Mount it once so every route — including all authenticated dashboard pages that don't have their own Helmet — gets a correct, changing tab title without touching ~30 page files.

### Implementation

1. **New file `src/components/shared/RouteTitle.tsx`**
   - Read `useLocation().pathname`.
   - Look up a friendly label from a `Record<string, string>` map covering the app's routes (executive-dashboard, dispatcher-dashboard, driver-dashboard, fleet-loads, agency-loads, finance, ledger, insights, ifta, maintenance, safety, incidents, crm, documents, resources, load-optimizer, drivers, trucks, trailers, settings, super-admin, driver-performance, driver-settings, driver-stats, onboarding, pending-access, account-deactivated, checkout-success, executive-dashboard, etc.).
   - For unmatched paths fall back to the brand default.
   - Render `<Helmet><title>{label} — FleetFlow TMS</title></Helmet>`.
   - Pages that already render their own `<Helmet>` (Landing, Auth, Pricing, About, Contact, Privacy, Terms, NotFound, ResetPassword, AcceptInvite, PublicLoadTracker) keep working — Helmet dedupes by tag and the page-level title wins because it mounts deeper in the tree.

2. **Mount once in `src/App.tsx`** inside `<BrowserRouter>` (above `<Routes>`) so it re-evaluates on every navigation.

### Out of scope

- No changes to existing per-page `<Helmet>` blocks.
- No SEO/meta-description rewrites — title only, matching the user's report.
- No changes to `index.html` default title (still used on first paint before React hydrates).
