Add a compact, read-only **My Equipment** card to the Driver Dashboard showing the driver's assigned truck and trailer with an out-of-service warning badge.

### Scope
Frontend-only. Reads existing tables; no schema or RLS changes.

### New file
`src/components/driver/MyEquipmentCard.tsx`

- Props: `{ driverId: string; assignedTruck?: { id, unit_number, make, model, year, status } | null }` — truck is already fetched on `DriverDashboard`, so we reuse it instead of re-querying.
- Internal `useQuery` keyed `['driver-trailer', driverId]` to find the current trailer via `trailer_assignments` (the active row is `released_at IS NULL`) joined to `trailers(id, unit_number, trailer_type, status)`.
- Internal `useQuery` keyed `['driver-equipment-work-orders', truckId]` for `work_orders.select('id, status, service_type, description').eq('truck_id', truckId).neq('status', 'completed')` — any open work order is treated as a "Critical Defect" signal.
- Status interpretation (shared helper):
  - `out_of_service` or `down` → **red destructive** badge labeled "OUT OF SERVICE — Do Not Dispatch"
  - `in_shop` or any open work order present → **amber warning** badge labeled "In Shop / Active Work Order"
  - `active` and no open work orders → muted "Active" badge
- Layout (compact, mirrors existing dashboard cards):
  - Card title: "My Equipment" with a `Truck` icon.
  - Two rows: Truck (unit number + make/model/year + per-equipment badge) and Trailer (unit number + type + badge). Each row collapses gracefully when not assigned ("No truck assigned — contact dispatch" / "No trailer assigned").
  - A prominent top-banner alert appears when any piece of equipment resolves to the red destructive state, repeating the "Do Not Dispatch" message so it can't be missed.
- Pure read-only — no edit affordances, no action buttons.
- Uses semantic tokens (`bg-destructive`, `bg-warning`, `text-destructive-foreground`, etc.) — no hardcoded colors.

### Wiring in `src/pages/DriverDashboard.tsx`
- Import the new component.
- Replace the current standalone "No truck assigned" warning block (lines ~180–185) with `<MyEquipmentCard driverId={driver.id} assignedTruck={assignedTruck} />`. The new card already handles the no-truck case more richly and also adds trailer visibility.
- Add the same query key (`'driver-trailer'`, `'driver-equipment-work-orders'`) to the `handleRefresh` invalidation list so manual refresh stays in sync.
- Placement: directly above the `ActiveLoadCard` so equipment status is the first thing a driver sees after the header.

### Verification
- Driver with `out_of_service` truck → red "Do Not Dispatch" banner + red badge on the truck row.
- Driver with `in_shop` truck → amber "In Shop" badge, no destructive banner.
- Truck `active` but has an open work order → amber "Active Work Order" badge.
- Driver with no trailer assignment → trailer row shows neutral "No trailer assigned".
- Driver with no truck → truck row shows the existing-style "No truck assigned — contact dispatch" message.
- Manual refresh on the dashboard updates equipment status without a full reload.