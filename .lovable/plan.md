# Fix: Driver tour requires two finish/skips before it stops appearing

## Root cause

The tour completion flag is split across two stores:
- `useProductTour` writes `tour_completed_<id>` to `localStorage` synchronously on finish/skip — this part is already correct.
- `DashboardLayout` persists `profiles.has_completed_onboarding_tour` to the database, but the **auto-start `useEffect` only checks the server flag**, never the synchronous local flag.

Consequence: when the layout remounts (driver navigates away and back, refresh, or React Strict mode double-mount) before the DB write settles, the server-side `hasSeenTour` still reads `false`, `autoStartedRef.current` is freshly `false`, and the tour starts a second time. The user has to finish/skip again to push the server flag through.

Two secondary issues compound it:
1. After auto-start from `/driver/onboarding`, we call `navigate(location.pathname)` without `{ replace: true }`. This **pushes** a new history entry instead of replacing the one carrying `state.startTour`, so a Back navigation re-triggers the tour.
2. There is no server → local reconciliation, so a driver on a fresh device (or after clearing localStorage) who *has* completed the tour on the server will get it again until the profile fetch resolves.

## Fix

### `src/hooks/useProductTour.ts`
- Add a `markCompleted()` helper that writes `localStorage.setItem(storageKey, 'true')` and clears active state. Have `nextStep` (on last step) and `skipTour` both delegate to it so the synchronous flag write is guaranteed before any async work.
- Expose `hasCompleted` as a stable callback (already returns the localStorage value) and a `syncFromServer(seen: boolean)` helper that writes `'true'` into localStorage when the server says the tour is done — this rehydrates new devices.

### `src/components/layout/DashboardLayout.tsx`
- In the profile-load effect, after reading `has_completed_onboarding_tour`, call `tour.syncFromServer(seen)` so the local flag mirrors the server flag immediately on every mount.
- In the auto-start effect, gate startup on **both** flags: `if (tour.hasCompleted()) return;` before evaluating `fromOnboarding` or `flagSaysStart`. This makes the synchronous localStorage value authoritative and eliminates the remount race.
- Change the state-stripping navigation to `navigate(location.pathname, { replace: true, state: {} })` so refresh and Back never resurface `startTour`. Widen the `navigate` prop type accordingly (or just call `useNavigate` directly inside `DashboardLayoutInner` to get the full signature).
- In `handleTourSkip` and the `isLast` branch of `handleTourNext`, write to localStorage *first* (the hook now does this) and fire `persistTourCompletion` as a follow-up. Keep `autoStartedRef.current = true` set even on completion so any same-mount re-render is also blocked.

### No DB migration
`profiles.has_completed_onboarding_tour` already exists.

## Acceptance criteria

- Clicking **Finish** or **Skip** once permanently dismisses the tour for that browser, even if the user immediately navigates away and back, refreshes, or the DB write is slow/fails.
- Pressing browser **Back** after auto-start does not re-trigger the tour (history entry replaced).
- A driver who completed the tour on another device gets `localStorage` rehydrated from the server flag on next dashboard mount and is not shown the tour again.
- "Replay Welcome Tour" from the Help menu still works (calls `tour.startTour()` directly and bypasses both flags).
- Dispatchers, owners, and routes without a `tourDef` continue to use `WelcomeBetaModal` unchanged.

## Out of scope

- Switching the onboarding handoff from `location.state` to a `?onboarding=complete` query param. The current `state.startTour` mechanism is functionally equivalent once `replace: true` is applied; introducing a query param would force a second navigation and is not needed to fix the double-prompt bug. (Happy to do it in a follow-up if you'd prefer the URL-based handshake.)
- Changes to tour step content or `ProductTour.tsx` rendering.
