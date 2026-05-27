## Diagnosis
The driver dashboard exposes two separate "request" entry points that write to two different tables:

| UI | Table | Visible on Maintenance Dashboard? |
|---|---|---|
| `MaintenanceRequestCard` → `MaintenanceRequestForm` | `maintenance_requests` | ✅ Yes (powers the Incoming Driver Fault Reports panel + chat thread) |
| `DriverRequestsCard` → `DriverRequestForm` (with type "Report Issue") | `driver_requests` | ❌ No — the maintenance panel only queries `maintenance_requests` |

The latest submission ("tires — New Drive Tires Needed") was filed through `DriverRequestForm`, so it landed in `driver_requests` and never appears on /maintenance. The chat module is bound to `maintenance_requests` via `maintenance_request_messages.request_id`, so any chat tied to that driver_request row has nowhere to live either.

The truck creation is unrelated — that's the /trucks page (already fixed by the org_id trigger). The user just lumped it in.

## Fix
Unify the maintenance path so every driver-reported fault flows into `maintenance_requests` and shows up on the Maintenance Dashboard with its chat thread.

### Change
In `src/components/driver/DriverRequestForm.tsx`, when `requestType === 'maintenance'`:
- Insert into `public.maintenance_requests` instead of `public.driver_requests`, with:
  - `driver_id`, `truck_id`, `priority`, `description` (or subject if no description), `status: 'submitted'`
  - `issue_type` normalized from the form's value (strip trailing `s` for `tires`/`brakes`/`lights` so it matches the canonical singular values used elsewhere; keep `cooling_system`, `electrical`, etc. as-is)
- Leave the existing non-maintenance branches (`detention`, `home_time`, `pto`) writing to `driver_requests` unchanged.
- On success, invalidate the `driver-maintenance-requests` query key so the driver's Maintenance card refreshes.

No DB migration is required — the `set_maintenance_request_org_id_trg` trigger already fills `org_id`, and RLS already allows drivers to insert their own rows.

### Out of scope
- Backfilling the existing `driver_requests` rows of `request_type='maintenance'` (only one new row — user can resubmit or we can copy it over if they want). Ask if they want a one-time backfill.
- Removing the duplicate "Report Issue" tile from `DriverRequestForm` — keeping it is fine since it now routes correctly. Could optionally relabel it.

### Files
- `src/components/driver/DriverRequestForm.tsx` — re-route maintenance submissions.
