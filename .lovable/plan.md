# Fix Owner Dashboard-Switch Buttons (Initial Load Race)

## Symptom

On a fresh load as Owner (landing on `/executive-dashboard`), clicking **Dispatcher View / Driver View / Maintenance View** does nothing — the page stays on Executive. After clicking **Executive View** once, the other simulation buttons start working normally.

## Root Cause

`handleDashboardSwitch` in `AppSidebar.tsx` fires two state updates back to back:

```text
setSimulatedRole('driver')   // AuthContext state
navigate('/driver-dashboard') // React Router location state
```

These live in two different update streams (React context state vs React Router's history listener). On the very first interaction, the simulation state update commits in a render *before* the location update lands. That intermediate render looks like this:

```text
location  = /executive-dashboard   (still old)
simulated = 'driver'               (new)
```

In `ProtectedRoute` this fails `hasAccess` (executive route is `allowedRoles=['owner']`, but `hasRole('owner')` returns false while simulating). The auto-exit `useEffect` we added last turn fires and calls `setSimulatedRole(null)`. That state update wins the race against the pending `navigate(...)` because React commits the effect before the Router's location setState is flushed, and the location update gets effectively cancelled by the resulting re-render staying on `/executive-dashboard`.

Net result: simulation gets wiped and the route never changes — "nothing happens." Once the user clicks Executive View, simulation is explicitly null, so the next click of Driver/Dispatcher View doesn't trip the transient bad state.

## Fix

Two coordinated changes, both purely frontend:

### 1. Make the switch atomic in `AppSidebar.tsx`

Wrap `setSimulatedRole` in `flushSync` so the simulation commit happens *before* `navigate(...)` is even called. That guarantees the next render already has the new route OR is still on the old route with the new sim — but the location update is queued cleanly after the committed sim state.

```text
import { flushSync } from 'react-dom';

const handleDashboardSwitch = (path, role) => {
  if (actuallyIsOwner) {
    flushSync(() => {
      setSimulatedRole(role === 'owner' ? null : role);
    });
  }
  navigate(path);
};
```

### 2. Make the auto-exit effect non-destructive in `ProtectedRoute.tsx`

The current effect immediately nulls `simulatedRole` whenever an owner lands on a route their simulated role can't access. That's too aggressive — it fires during route transitions and kills in-flight navigations. Replace it with a guarded version that only triggers after a short tick so route transitions have time to settle:

```text
useEffect(() => {
  if (!stillLoading && authenticated && actuallyIsOwner && simulatedRole && !hasAccess) {
    const t = setTimeout(() => setSimulatedRole(null), 0);
    return () => clearTimeout(t);
  }
}, [...]);
```

The `setTimeout(..., 0)` defers the clear past the current commit, letting any pending `navigate(...)` settle first. If the navigation moves the owner to a route the simulation *can* access, `hasAccess` flips to true on the next render and the timer is cancelled — simulation is preserved. If not, simulation is cleared and the user lands on a real accessible route.

The existing Loader fallback (`if (!hasAccess && actuallyIsOwner && simulatedRole) return <Loader/>`) stays — it prevents the access-denied toast and the fallback Navigate from firing during that one-tick deferral.

## Validation

1. Fresh load as Owner → land on `/executive-dashboard`.
2. Click **Driver View** → navigates to `/driver-dashboard`, "Viewing as: driver" banner appears.
3. Click **Dispatcher View** → navigates to `/dispatcher-dashboard`, banner updates.
4. Click **Maintenance View** → navigates to `/maintenance-home`, banner updates.
5. While simulating Driver, click a sidebar item the driver role can't access (or hit a stale URL) → simulation auto-exits (deferred), user lands on their owner home, single access-denied toast fires.
6. Click **Executive View** → simulation cleared, banner disappears, full owner sidebar restored.

## Files Touched

- `src/components/layout/AppSidebar.tsx` — wrap simulation setter in `flushSync`.
- `src/components/shared/ProtectedRoute.tsx` — defer auto-exit by one tick.

No backend, RLS, or routing config changes.
