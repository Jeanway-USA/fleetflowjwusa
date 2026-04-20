

## Fix "WebSocket not available: The operation is insecure" Crash on Driver Dashboard

### Root cause
On iOS Safari (and certain in-app WebViews / mixed-context situations), the Supabase Realtime client throws `WebSocket not available: The operation is insecure` synchronously when `supabase.channel(...).subscribe()` is called. This happens inside `DriverNotifications` (and a few other components that use realtime). Because `DriverNotifications` is rendered in the dashboard header and is **not** wrapped in an `ErrorBoundary`, the throw bubbles up to the page-level boundary and replaces the entire dashboard with the "Something went wrong" screen.

### Fix (2 parts)

**1. Defensively wrap every realtime `.subscribe()` call in try/catch**

In each of these files, wrap the `supabase.channel(...).on(...).subscribe()` chain in a try/catch and log a warning instead of throwing. Realtime is always an enhancement — the page must work without it.

Files:
- `src/components/driver/DriverNotifications.tsx`
- `src/hooks/usePMNotifications.ts`
- `src/components/dispatcher/FleetMapView.tsx`
- `src/components/dispatcher/DispatcherAlerts.tsx`
- `src/components/dispatcher/ActiveLoadsBoard.tsx`
- `src/pages/DispatcherDashboard.tsx`

Pattern:
```ts
useEffect(() => {
  if (!driverId) return;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase.channel('driver-notifications-realtime')
      .on('postgres_changes', { ... }, () => { ... })
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription unavailable:', err);
  }
  return () => { if (channel) supabase.removeChannel(channel); };
}, [driverId, queryClient]);
```

**2. Wrap `DriverNotifications` in an `ErrorBoundary` in the dashboard header**

In `src/pages/DriverDashboard.tsx`, wrap `<DriverNotifications driverId={driver.id} />` with `<ErrorBoundary compact>` so any future bell-icon failure can't take down the entire page.

### Result
- iOS Safari / in-app browsers no longer crash the Driver Dashboard
- Realtime updates simply degrade gracefully — the user can still pull-to-refresh
- A future failure in the notification bell would render a tiny inline error instead of nuking the page

