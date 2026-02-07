

## Plan: Live Dispatcher Alerts + Route Map on ActiveLoadCard

### Part 1: Live Alerts on Dispatcher Dashboard

**Problem:** The Alerts & Actions panel uses a standard `useQuery` fetch, so the dispatcher must refresh the page to see new driver requests (detention, home time, PTO, maintenance). This delays response times.

**Solution:** Add a Supabase Realtime subscription on the `driver_requests` table so the alerts query automatically re-fetches whenever a new request comes in or an existing one is updated.

**Database Migration:**
- Add `driver_requests` to the `supabase_realtime` publication so Postgres changes are broadcast.

**File: `src/components/dispatcher/DispatcherAlerts.tsx`**
- Add a `useEffect` that subscribes to the `driver_requests` Realtime channel, listening for INSERT, UPDATE, and DELETE events.
- On any change, call `queryClient.invalidateQueries({ queryKey: ['dispatcher-alerts'] })` to re-fetch the full alerts list.
- Clean up the subscription on unmount.
- This approach is efficient: the Realtime channel acts as a lightweight "something changed" signal, and the existing query handles the actual data fetching and sorting logic. No need to manually merge payloads.

The pattern follows the same approach used in `FleetMapView.tsx` and `DriverNotifications.tsx` for their respective Realtime subscriptions.

---

### Part 2: Route Map Preview on ActiveLoadCard

**Problem:** The redesigned ActiveLoadCard is compact but lacks a visual route preview showing where the load is going.

**Solution:** Add the existing `LoadRouteMap` component to the ActiveLoadCard, placed between the date/time row and the miles/pay row. This component already handles geocoding, Leaflet rendering, loading skeletons, and silent failure -- no new logic is needed.

**File: `src/components/driver/ActiveLoadCard.tsx`**
- Import the `LoadRouteMap` component from `./LoadRouteMap`.
- Render `<LoadRouteMap origin={load.origin} destination={load.destination} />` between the date row and the miles/pay separator.
- The map will show a dashed line from origin to destination with green (origin) and red (destination) markers, matching the existing map style used elsewhere in the app.
- If geocoding fails, the map silently hides itself (built-in behavior), so the card remains clean.

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Migration | New SQL migration | `ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_requests` |
| Modify | `src/components/dispatcher/DispatcherAlerts.tsx` | Add Realtime subscription on `driver_requests` to auto-invalidate alerts query |
| Modify | `src/components/driver/ActiveLoadCard.tsx` | Add `LoadRouteMap` component between date row and miles/pay row |

No new components or dependencies are needed. Both changes reuse existing patterns and components already in the codebase.
