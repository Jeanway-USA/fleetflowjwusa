
# Phase 2a — Extensible role helper + public surface removal

Slice goal: get the app working with a single generic role helper and no public SaaS surface, without dropping any columns or RLS yet.

## 1. Database (single migration)

- **New helper**: `public.get_user_role(_user_id uuid) RETURNS text` — SECURITY DEFINER, `search_path = public`, STABLE. Returns the highest-privilege role for the user from `user_roles` scoped to JeanWay (`'admin' > 'driver' > NULL`). Returns `'admin'` for anyone with any admin-tier legacy role (`owner`, `payroll_admin`, `dispatcher`, `safety`, `maintenance`) during transition; `'driver'` for drivers; `NULL` otherwise. `GRANT EXECUTE ... TO authenticated`.
- **Migrate JeanWay's roles**: `UPDATE user_roles SET role = 'admin' WHERE role = 'owner'` (3 rows). Legacy role rows for other tiers already purged; if any linger, also collapse to `admin`.
- No column drops, no policy rewrites, no table drops in this slice. Existing `has_role`/`is_owner`/etc. keep working so RLS stays intact.

## 2. Frontend role hook

- Replace `useUserRole`/`useRole` internals with a single query that calls `get_user_role` and exposes:
  ```ts
  { role: 'admin' | 'driver' | null, isAdmin: boolean, isDriver: boolean, isLoading }
  ```
- Keep the existing hook names as thin wrappers so nothing else has to change this slice.
- `ProtectedRoute`: authenticated + `role in ('admin','driver')`. Anyone else is signed out and returned to `/`.

## 3. Route surface

- `/` now renders the new **JeanWay login screen** (minimal, dark, branded, no signup link, no marketing).
- Remove routes and their imports from `src/App.tsx`:
  - `/landing`, `/pricing`, `/about`, `/contact`
  - `/public-load-tracker` (and any `/track/:id` public alias)
  - `/onboarding-wizard` (org creation)
  - `/pending-access`
  - `/live-demo`, `/beta-onboarding`
  - `/subscription-upgrade`, `/billing`, `/manage-plan`
- Keep: `/reset-password`, `/driver-onboarding` (new-hire paperwork), all authenticated app routes.
- Files removed this slice: the page files above only. Their supporting component folders (`src/components/marketing/`, `subscription/`, `billing/`, `demo/`, `tour/`, `feedback/`, `admin/impersonation/`, `onboarding/wizard/`) stay on disk for now — we'll delete them in a later cleanup slice once we're sure nothing else imports them.

## 4. Sidebar restructure

Rewrite `src/components/app-sidebar.tsx` (and the driver equivalent) with the operational groups:

```text
Admin sidebar
  Dispatch & Loads
    Load Board / Load History / Create Load
  Fleet & Maintenance
    Trucks / Trailers / Maintenance Requests / Work Orders / Telematics
  Drivers & Payroll
    Driver Roster / Payroll Runs / Settlements / Onboarding Invitations
  Financials
    Fuel Card / Expenses / P&L per Truck / IFTA
  Admin
    Partners / Documents / Audit Log / Company Settings

Driver sidebar
  My Loads / My Pay / My Documents / Profile
```

- `collapsible="icon"`, active-route highlight via `NavLink`, groups stay expanded when their route is active.
- Route targets reuse existing pages; no new pages built this slice.

## 5. Header cleanup

- Remove: workspace switcher, org name, TMS-mode toggle, tier/trial/beta/impersonation banners, feedback widget, product tour launcher, live-demo pill, "Upgrade" and "Manage billing" links in the avatar menu.
- Keep: sidebar trigger, JeanWay wordmark left, notifications bell, avatar menu with just **Profile** and **Sign out**.
- Do NOT delete those component files yet — just stop rendering them.

## 6. Theme

- Update `src/index.css` HSL tokens to the JeanWay dark palette (deep slate bg, steel surfaces, amber accent, near-white text). All via tokens; no hardcoded utility colors touched in components.

## 7. Verification (must pass before we move on)

- Sign in as JeanWay owner → land on the dashboard, new sidebar renders, no billing/marketing UI, no console errors.
- Sign in as JeanWay driver → driver portal renders, no admin routes reachable.
- Hit `/` while signed out → login screen only.
- Hit `/landing`, `/pricing`, `/subscription-upgrade` etc. → 404 or redirect to `/`.
- No TS build errors.

## 8. Explicitly deferred to Phase 2b

- Dropping `org_id` columns across tables.
- Rewriting every RLS policy to drop the `get_user_org_id` join.
- Dropping `organizations`, `invitations`, `subscription_plans`, `promo_codes`, `super_admins`, `changelog`, `user_feedback`, `org_storage_config`, `internal_config`.
- Deleting billing/impersonation/demo edge functions.
- Deleting the dead component folders left behind in step 3.
