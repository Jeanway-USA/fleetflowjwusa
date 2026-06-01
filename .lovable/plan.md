## Fix: Driver tutorial not appearing after onboarding

### Root causes

Read the auto-start logic in `DashboardLayout.tsx` (lines 186–204) and the onboarding completion handoff in `DriverOnboarding.tsx` (line 485). Three problems compound:

1. **`tour.hasCompleted()` (localStorage) short-circuits before the onboarding signal is checked.** If the localStorage key `tour_completed_driver_v2` is `true` from a prior test run, the explicit `state: { startTour: true }` from onboarding is ignored.
2. **Shared server flag bleeds into per-tour localStorage.** `profiles.has_completed_onboarding_tour` is one global boolean for every tour. `syncFromServer(true)` writes `tour_completed_driver_v2=true` even if the driver never saw the driver tour (e.g. flag was already set during testing or by an admin role). This permanently suppresses the tour.
3. **In-memory `location.state` is fragile.** If `ProtectedRoute` redirects through `/driver/onboarding` while auth state is still catching up (or the user reloads), `state.startTour` is dropped and the tour never auto-starts.

### Fix plan (frontend only)

**`src/pages/DriverOnboarding.tsx`**
- On the "Go to Dashboard" click, also write `localStorage.setItem('pending_driver_tour', '1')` before navigating. This persistent flag survives any intermediate redirects or refreshes.

**`src/hooks/useProductTour.ts`**
- Remove `syncFromServer` (or make it a no-op for driver tour) — the global `has_completed_onboarding_tour` flag is the wrong signal to mirror into a per-tour key. Completion will still be persisted server-side by the existing `persistTourCompletion` write, and the dashboard already reads `hasSeenTour` directly.

**`src/components/layout/DashboardLayout.tsx`**
- In the auto-start effect, check explicit signals first and reorder logic:
  1. Compute `fromOnboarding = location.state?.startTour === true || localStorage.getItem('pending_driver_tour') === '1'`.
  2. If `fromOnboarding` → call `tour.resetTour()` (clears stale localStorage), then `tour.startTour()`, clear the `pending_driver_tour` key, and replace history state. Do this **before** the `tour.hasCompleted()` check so onboarding always wins.
  3. Otherwise, keep the existing `flagSaysStart` (server `has_completed_onboarding_tour === false`) auto-start path, gated by `tour.hasCompleted()`.
- Stop calling `tour.syncFromServer(seen)` so the global server flag never poisons the per-tour localStorage key.

No DB or RLS changes. No changes to tour step content or anchors (verified all `#tour-*` anchors render unconditionally in `DriverDashboard.tsx`).