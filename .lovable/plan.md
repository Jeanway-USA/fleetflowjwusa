## What's happening

The "Issue" button is the maintenance tile inside `DriverRequestsCard` (My Requests card). The last edit reroutes future "Issue" submissions to `maintenance_requests`, but:

1. **The one issue you submitted earlier** ("tires — New Drive Tires Needed") was filed *before* that fix, so it still lives in `driver_requests` and appears under the dispatcher's Alerts. `maintenance_requests` is currently empty — that's why the Maintenance dashboard shows nothing.
2. **The dispatcher Alerts panel still pulls maintenance-type driver_requests**, which is why the Approve/Deny dialog appeared at all. Since maintenance issues should never need dispatcher approval, this is wrong.

## Fix

### 1. Backfill (one-off data migration)
For every `driver_requests` row with `request_type = 'maintenance'` that has a `truck_id` and is not yet resolved (`status IN ('pending')`), insert a matching row into `maintenance_requests` with:
- `driver_id`, `truck_id`, `org_id`
- `issue_type` = normalized (strip the leading `"<type> — "` prefix from the subject if present, or derive from subject — practical: just use whatever leading word exists, defaulting to `'other'`)
- `priority`
- `description` = `subject + "\n\n" + description` (preserves the driver's notes)
- `status = 'submitted'`

Then mark the source `driver_requests` row `status = 'migrated'` so it disappears from dispatcher alerts and the driver's "Pending" list (the driver's recent list maps unknown statuses safely).

### 2. Stop routing maintenance to the dispatcher (code)
In `src/components/dispatcher/DispatcherAlerts.tsx`:
- Add `.neq('request_type', 'maintenance')` to the pending `driver_requests` query (defensive — protects against any older rows or legacy clients).

No DB schema or RLS changes are needed. No edits to the driver-side form (already routed correctly).

### Files
- New migration: backfill SQL described above.
- `src/components/dispatcher/DispatcherAlerts.tsx` — exclude maintenance request_type.
