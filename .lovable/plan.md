## What's out of date in the spectator

`src/pages/DriverSpectatorView.tsx` was built before the recent driver-dashboard work and is now missing several widgets and shows **$0 for flat-rate drivers** because it always renders `DriverPayWidget` (which only has math for `percentage` and `per_mile`). The real `src/pages/DriverDashboard.tsx` already routes flat-pay drivers to `WeeklyPerformanceWidget` — the spectator skips that swap.

## Fix

Bring the spectator in line with the real dashboard, in read-only form.

### 1. Weekly Goal widget — flat-rate handling

In `DriverSpectatorView.tsx`, mirror the dashboard's pattern:
```ts
{driver.pay_type === 'flat'
  ? <WeeklyPerformanceWidget driverId={driver.id} weeklyFlatRate={driver.pay_rate ?? 0} readOnly />
  : <DriverPayWidget payType={driver.pay_type} payRate={driver.pay_rate} driverId={driver.id} readOnly />}
```
`WeeklyPerformanceWidget` already shows mileage / loads progress, which is what a flat-paid driver should see (their pay isn't variable, so a $-goal bar is meaningless).

### 2. Missing widgets to add (read-only)

- `DriverRequestsCard` — replace the bespoke inline list (lines 271–297) so categorized requests + future updates flow through automatically.
- `MaintenanceRequestCard` — add below requests; pass a read-only flag so the "New request" button is hidden/disabled.
- `DriverLeaderboard` — add with `readOnly`.
- Pass `driverId` to `ActiveLoadCard` (currently omitted) and remove its `onStatusUpdate` so it stays read-only.

### 3. Stability

Wrap each major widget in `<ErrorBoundary compact>` (same pattern the real dashboard already uses) so one widget failing doesn't blank the whole spectator page.

### 4. Drop the stale bespoke GPS card

Replace the hand-rolled GPS status block (lines 244–258) with the shared `LocationSharing` component in a read-only mode (no toggle, just status + last ping). If `LocationSharing` doesn't already accept a `readOnly` prop, add one that hides the start/stop button.

### Intentionally not changing

- Existing spectator banner, header, and access guard.
- `DriverPayWidget` itself — flat-rate handling stays in the dashboard-level branching, matching how the real dashboard already does it.
- Real `DriverDashboard.tsx` — no changes; only the spectator drifted.
- HOS — already removed from both views.

## Files touched

- `src/pages/DriverSpectatorView.tsx` — main rewrite of the widget grid.
- `src/components/driver/LocationSharing.tsx` — only if needed to add a `readOnly` prop.
- `src/components/driver/DriverRequestsCard.tsx`, `MaintenanceRequestCard.tsx`, `DriverLeaderboard` — only if a `readOnly` prop needs to be added/honored (preferred over duplicating UI).

No DB or RLS changes.
