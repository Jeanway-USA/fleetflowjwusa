## Plan

1. **Fix the leftover dashboard self-redirect**
   - Update `src/pages/DispatcherDashboard.tsx` so it no longer redirects to `/` when the owner switches simulation from Dispatcher View to Driver View.
   - Best fix: remove the redundant page-level `<Navigate to="/" />` guard and rely on `ProtectedRoute`, which already handles route access correctly for real owners.

2. **Clean up unused imports**
   - Remove `Navigate` from `DispatcherDashboard.tsx` if the guard is removed.

3. **Validate the exact workflow**
   - From Executive Dashboard as an owner:
     - Click Dispatcher View.
     - Click Driver View directly.
     - Click Dispatcher View directly again.
   - Confirm each click changes pages on the first attempt and never bounces through Executive View.

## Technical details

The remaining issue is likely caused by `DispatcherDashboard.tsx` doing its own role redirect:

```ts
if (!hasRole('dispatcher') && !hasRole('owner') && roles.length > 0) {
  return <Navigate to="/" replace />;
}
```

Because `hasRole()` respects simulated roles, clicking Driver View while currently on Dispatcher View temporarily re-renders the dispatcher page as `driver` before navigation finishes. That guard sends the app to `/`, and `/` redirects real owners back to Executive Dashboard. Removing this redundant guard lets `ProtectedRoute` be the single source of routing truth.