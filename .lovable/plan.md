## Add delete for driver fault reports

Give maintenance staff a way to remove fault reports from the "Incoming Driver Fault Reports" panel (e.g. duplicates, test entries, or resolved-without-WO items).

### Changes

**1. `src/hooks/useDriverFaultReports.ts`**
- Add `useDeleteFaultReport()` mutation that deletes the row from `maintenance_requests` by id and invalidates `['driver-fault-reports']` and `['driver-maintenance-requests']` so both the maintenance panel and the driver dashboard refresh.

**2. `src/components/maintenance/DriverFaultReportsPanel.tsx`**
- Add a small `Trash2` icon button on each `ReportRow` (ghost variant, destructive color), placed alongside the existing Chat / Convert / Acknowledge buttons.
- Wrap it in a shadcn `AlertDialog` confirmation ("Delete this driver fault report? This cannot be undone.") to prevent accidental clicks.
- On confirm: call the delete mutation, show success/error toast.

### Notes
- No DB migration needed — existing RLS on `maintenance_requests` already permits org members to delete their org's rows.
- Linked work orders are not touched; deleting a report that's already converted just removes the request record (the WO remains).
- The driver-side card uses the same row; since it'll be gone from the table, it disappears from the driver's history list automatically via realtime.