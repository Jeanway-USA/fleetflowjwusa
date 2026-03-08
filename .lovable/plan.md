

## Plan: Geofence Status Hook + Arrival Drawer

### 1. Create `useGeofenceStatus` Hook

**File: `src/hooks/useGeofenceStatus.ts`**

- Accepts `driverCoords: { lat: number; lng: number } | null` and `destinationAddress: string | null`
- Uses `geocodeLocationAsync` to resolve destination address to coordinates (cached after first call)
- Computes Haversine distance between driver position and destination
- Returns `{ isNearDestination: boolean; distanceMiles: number | null }`
- Threshold: 2 miles
- Includes a `dismissed` state so the driver can dismiss the prompt and it won't re-trigger for the same load

### 2. Create `GeofenceArrivalDrawer` Component

**File: `src/components/driver/GeofenceArrivalDrawer.tsx`**

- Uses the existing `Drawer` component from `src/components/ui/drawer.tsx` (vaul-based bottom sheet)
- Props: `open`, `onOpenChange`, `loadId`, `onConfirmed`
- Shows: "You're near the destination. Update load status to Arrived?" with distance indicator
- Single "Confirm Arrival" button that:
  - Calls `supabase.from('fleet_loads').update({ status: 'unloading' }).eq('id', loadId)`
  - Shows toast on success
  - Calls `onConfirmed` callback + closes drawer
- Loading state on button during mutation

### 3. Integrate into DriverDashboard

**File: `src/pages/DriverDashboard.tsx`**

- Extract `currentPosition` from the existing `LocationSharing` component's GPS data by querying `driver_locations` for the current driver
- Pass driver coords + active load destination to `useGeofenceStatus`
- Render `<GeofenceArrivalDrawer>` when `isNearDestination && activeLoad.status === 'in_transit'`
- On confirm, call `refetchLoads` to refresh the dashboard

### Data Flow

```text
driver_locations (lat/lng) + activeLoad.destination
  → useGeofenceStatus (geocode dest → haversine distance)
  → isNearDestination (< 2 miles)
  → GeofenceArrivalDrawer opens
  → "Confirm Arrival" → fleet_loads.status = 'unloading'
  → drawer dismisses + loads refetch
```

### Files

| File | Action |
|---|---|
| `src/hooks/useGeofenceStatus.ts` | Create — distance check hook |
| `src/components/driver/GeofenceArrivalDrawer.tsx` | Create — bottom drawer with confirm button |
| `src/pages/DriverDashboard.tsx` | Edit — wire hook + drawer to active load |

