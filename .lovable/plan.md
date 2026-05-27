## Goal

Let the driver see their maintenance requests (current + history) on the Driver Dashboard, and chat back-and-forth with the maintenance team — mirroring the chat that already exists on the maintenance side.

## What's already in place

- Table `maintenance_request_messages` + RLS allow driver ↔ maintenance chat.
- `MaintenanceThread` (used today inside the maintenance `DriverFaultReportsPanel`) handles the full conversation UI with realtime updates.
- `MaintenanceRequestCard` driver-side component is already written (with inline `MaintenanceThread` + a "Chat with shop" toggle and a "Report Issue" dialog) — but it's never imported on the dashboard, which is why the driver sees nothing.

## Changes

1. **New hook** `src/hooks/useDriverMaintenanceRequests.ts`
   - Fetches `maintenance_requests` for the signed-in driver, joining `trucks(unit_number)`, ordered newest-first.
   - Subscribes to realtime inserts/updates so new shop messages and status changes refresh the list.

2. **Update `src/components/driver/MaintenanceRequestCard.tsx`**
   - Use the new hook internally (drop the `requests` prop) so the card is self-contained.
   - Default view: open requests (anything not `completed`).
   - Add a "Show history" toggle that reveals completed requests below.
   - Keep the existing inline `MaintenanceThread` per request and the "Report Issue" dialog.
   - Show a small unread/last-message hint and the latest status badge.

3. **Mount on Driver Dashboard** (`src/pages/DriverDashboard.tsx`)
   - Import and render `MaintenanceRequestCard` just below `DriverRequestsCard`, passing `driverId` and `assignedTruck?.id`. No other layout changes.

No database, RLS, or backend changes are needed — the chat table, policies, and the `MaintenanceThread` component already support driver participation.

## Result

- Driver sees all their submitted issues (current and past) on the dashboard.
- Each request expands into a live chat thread with the maintenance team, with the same UX the maintenance role already uses.
- Status updates from the shop (acknowledged / scheduled / in progress / completed) show up automatically.