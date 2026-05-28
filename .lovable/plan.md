## Wire up the 3 remaining Quick Action buttons

Currently `Log Parts Usage`, `Message a Driver`, and `Update Truck Status` all fall back to the New Work Order sheet or a navigate. Give each its own state + dialog and a real mutation.

### Files

**New components**
- `src/components/maintenance/LogPartsUsageDialog.tsx`
- `src/components/maintenance/MessageDriverDialog.tsx`
- `src/components/maintenance/UpdateTruckStatusDialog.tsx`

**Edited**
- `src/hooks/useMaintenanceData.ts` — add three mutations + a tiny drivers query
- `src/pages/MaintenanceDashboardHome.tsx` — split handlers + mount dialogs

### Database migration (required)

The `trucks.status` check constraint only allows `'active' | 'down' | 'out_of_service'`. The user wants `'Active' | 'In Shop' | 'Out of Service' | 'Pending Inspection'`. Migration:

1. Drop `trucks_status_check`.
2. Recreate it allowing `'active', 'in_shop', 'out_of_service', 'pending_inspection', 'down'` (keep `down` as legacy synonym so existing rows don't break).
3. Add a policy allowing `maintenance` role to INSERT into `maintenance_requests` (so the Message Driver dialog can open a thread). The existing "Owner safety can manage" policy still covers owner/safety.

### Hook additions in `useMaintenanceData.ts`

```ts
// Drivers dropdown (active only)
useActiveDrivers()  // → id, first_name, last_name from drivers where status='active'

// Decrement inventory
useLogPartUsage({ part_id, quantity, truck_id?, work_order_id? })
  // fetch current qty → update quantity_on_hand = max(0, current - quantity)
  // append a usage note into parts_inventory.notes (e.g. "Used 2 on WO #abc / Truck 101 — 2026-05-28")
  // invalidate ['all-parts-inventory'] + ['low-stock-parts']

// Update truck status
useUpdateTruckStatus({ truck_id, status })
  // update trucks.status; invalidate ['trucks-list'], ['fleet-availability'], ['active-work-orders']
```

No new tables — quantity deduction lives on `parts_inventory.quantity_on_hand` and an audit note in `parts_inventory.notes`. (If a dedicated usage-history table is wanted later, that's a follow-up.)

### Dialog specs

**LogPartsUsageDialog**
- Part select: `useAllPartsInventory()` → shows `part_name (qty_on_hand {unit} in stock)`. Disabled when qty=0.
- Quantity used: number input, min=1, max=selected part's `quantity_on_hand`.
- Apply to: radio toggle "Truck" / "Work Order" → second select pulls from `useTrucks()` or `useActiveWorkOrders()`. Either is optional.
- Submit → `useLogPartUsage`. Toast success/error. Closes on success.

**MessageDriverDialog**
- Driver select: `useActiveDrivers()` shows `First Last`.
- Message textarea (required, max 1000 chars).
- Submit flow:
  1. Look up the most recent open thread for that driver: `maintenance_requests` where `driver_id=...` and `status in ('submitted','acknowledged','in_progress')` ordered by `created_at desc`.
  2. If none, create a new `maintenance_requests` row: `driver_id`, `truck_id = driver.current_truck or first truck`, `issue_type='other'`, `priority='medium'`, `description='Message from maintenance team'`, `status='acknowledged'`.
  3. Insert the message into `maintenance_request_messages` via `useSendMaintenanceMessage({ request_id, body, sender_role: 'maintenance' })`.
- Invalidate `['driver-fault-reports']` so the Live Driver Alerts widget reflects it.

**UpdateTruckStatusDialog**
- Truck select: `useTrucks()` → `Unit {unit_number} — {make} {model}`.
- Status select: `Active`, `In Shop`, `Out of Service`, `Pending Inspection` (mapped to `active | in_shop | out_of_service | pending_inspection`).
- Submit → `useUpdateTruckStatus`. Closes on success.

### `MaintenanceDashboardHome.tsx` changes

Add three more `useState` flags (`partsOpen`, `messageOpen`, `truckOpen`). Replace the QuickActionsCard wiring so each button hits its own handler:

```tsx
<QuickActionsCard
  onCreateWorkOrder={() => setWoOpen(true)}
  onLogParts={() => setPartsOpen(true)}
  onMessageDriver={() => setMessageOpen(true)}
  onUpdateTruck={() => setTruckOpen(true)}
/>
```

Expand `QuickActionsCardProps` with the two new callbacks and update the `actions` array accordingly (no more `navigate('/maintenance')` / `navigate('/trucks')` fallbacks). Mount the three new dialogs alongside `NewWorkOrderSheet`.

### Out of scope
- No new usage-history table (audit lives in `parts_inventory.notes` for now).
- No realtime status colors — the existing badges already key off `trucks.status`.