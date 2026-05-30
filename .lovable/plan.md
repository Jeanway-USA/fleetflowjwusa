## Current state

- `DashboardLayout.tsx` mounts `<ProductTour>` and resolves `tourDef` via `getTourForRoute` (driver route is `/driver-dashboard`, tourId `driver_v1`).
- The only auto-trigger today is `WelcomeBetaModal`, which opens when `profiles.has_completed_onboarding_tour` is false and asks the user to click "Start tour". The tour itself never auto-starts.
- `useProductTour` persists completion only to `localStorage` (`tour_completed_<id>`), so a new device or cleared storage re-prompts forever; the server flag `has_completed_onboarding_tour` is only flipped by `WelcomeBetaModal`.
- `DriverOnboarding.tsx` success screen calls `navigate('/driver')` — that route does not exist. The real route is `/driver-dashboard`. There is no signal carried over to start the tour.
- The user's "`has_seen_tour`" maps to the existing `profiles.has_completed_onboarding_tour` column — no migration needed.

## Goal

A driver lands on `/driver-dashboard` and the product tour auto-starts when either:

1. They just finished `/driver/onboarding` (signal carried via router state), OR
2. `profiles.has_completed_onboarding_tour` is `false` on their profile.

For everyone else (already-onboarded drivers, dispatchers, owners) nothing changes.

## Changes

### 1. `src/pages/DriverOnboarding.tsx` — fix redirect and pass tour signal

Replace the broken `navigate('/driver')` on the success screen with:

```ts
navigate('/driver-dashboard', { replace: true, state: { startTour: true } });
```

`replace: true` prevents back-nav into the one-time success screen. `state.startTour` is a one-shot, in-memory signal that survives only the SPA transition (cannot be forged across reloads — refresh drops it).

### 2. `src/components/layout/DashboardLayout.tsx` — auto-start + persistence

In `DashboardLayoutInner`:

- Read `useLocation()` (already imported). When `tourDef` exists and we haven't auto-started yet this mount, decide whether to start:
  - **A.** If `location.state?.startTour === true` → call `tour.startTour()` and immediately `navigate(location.pathname, { replace: true, state: {} })` so a refresh won't replay it. Guard with a `useRef` so the effect runs once.
  - **B.** Otherwise, when the profile fetch returns and `has_completed_onboarding_tour === false`, auto-start the tour for users whose current route has a `tourDef` (covers the driver dashboard case). Suppress the existing `WelcomeBetaModal` in this auto-start path (only show the modal when there is no tour for the current route, so non-tour pages still get the welcome CTA).
- When the tour completes or is skipped on the driver route, also persist server-side. Wrap `tour.skipTour` and detect last-step `nextStep`:

```ts
const completeTour = async () => {
  if (user) {
    await supabase
      .from('profiles')
      .update({ has_completed_onboarding_tour: true } as any)
      .eq('user_id', user.id);
  }
};
```

Pass wrapped handlers into `<ProductTour onSkip={...} onNext={...}>` that call `completeTour()` when the tour ends.

### 3. No database migration

`profiles.has_completed_onboarding_tour` already exists and is already part of the WelcomeBetaModal flow. We just start using it as the canonical "has_seen_tour" gate.

## Acceptance

- Finishing `/driver/onboarding` and clicking "Go to Dashboard" lands on `/driver-dashboard` (not the broken `/driver`), and the driver product tour auto-opens on first step.
- A driver who has never seen the tour and arrives at `/driver-dashboard` by any other path also gets the tour auto-opened once.
- Completing or skipping the tour flips `profiles.has_completed_onboarding_tour = true`, so subsequent visits and other devices do not re-trigger it.
- Replaying via Help → "Replay Welcome Tour" still works (uses `tour.startTour` directly, ignores the flag).
- Dispatchers, owners, and already-onboarded drivers see no change.

## Files touched

- `src/pages/DriverOnboarding.tsx` (one-line redirect change)
- `src/components/layout/DashboardLayout.tsx` (auto-start effect + completion persistence)
