## Goal

Make driver-submitted maintenance issues visible to maintenance staff on the `/maintenance` page in real time, with one-click "Convert to Work Order" so reports flow seamlessly into the existing Active Work Orders pipeline.

## Current state

- Table `public.maintenance_requests` already exists with the right columns (`driver_id`, `truck_id`, `issue_type`, `priority`, `description`, `status` ∈ submitted/acknowledged/scheduled/in_progress/completed, `admin_notes`, `org_id`).
- Driver form at `src/components/driver/MaintenanceRequestForm.tsx` inserts into this table **without `org_id`**, which fails the RLS `WITH CHECK (org_id = get_user_org_id(auth.uid()))` and silently blocks submissions.
- RLS currently allows owner + safety to manage. The new `maintenance` role has no policy yet.
- The Maintenance Management page never reads from this table.

## 1. Database migration

```sql
-- (a) Auto-populate org_id from the inserting user if not provided,
--     so existing driver clients work without a code change to org_id wiring.
CREATE OR REPLACE FUNCTION public.set_maintenance_request_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_maintenance_request_org_id_trg
  BEFORE INSERT ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_request_org_id();

-- (b) Extend access to the new maintenance role.
CREATE POLICY "Maintenance role can view maintenance requests"
  ON public.maintenance_requests FOR SELECT
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Maintenance role can update maintenance requests"
  ON public.maintenance_requests FOR UPDATE
  USING (has_role(auth.uid(), 'maintenance'::app_role)
         AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));
```

No schema/column changes. No new tables.

## 2. Driver form hardening — `src/components/driver/MaintenanceRequestForm.tsx`

Also pass `org_id` explicitly when available (defensive, in case trigger is ever bypassed). Fetch via the existing profile/auth context if already imported nearby, otherwise leave the trigger as the single source of truth. Minimal change: add a `.select().single()` on the insert so the form surfaces server errors clearly.

## 3. New hook — `src/hooks/useDriverFaultReports.ts`

Three exports, all scoped to `status IN ('submitted','acknowledged')` (i.e., not yet converted):

- `useDriverFaultReports()` → `useQuery(['driver-fault-reports'])`, joins `drivers(first_name,last_name)` and `trucks(unit_number)`, ordered by priority (critical→low) then `created_at` desc.
- `useAcknowledgeFaultReport()` → sets `status='acknowledged'`.
- `useConvertFaultReportToWorkOrder()` → in one mutation: inserts a `work_orders` row (mapping `issue_type` → `service_type`: tire→`tire`, brake/engine/electrical/lights/trailer/other→`repair`; `description` carries the driver's text prefixed with "Driver report: "; `entry_date` = today; `cost_estimate` null), then updates the request to `status='in_progress'` with `admin_notes` storing the new work-order id for traceability. Invalidates `['driver-fault-reports']`, `['active-work-orders']`, `['fleet-availability']`.

## 4. New panel — `src/components/maintenance/DriverFaultReportsPanel.tsx`

Visual style matches the PM Schedule "Urgent Action Required" banner so it sits naturally above the Active Work Orders table.

```text
┌─ Incoming Driver Fault Reports ─────────────[N submitted]─┐
│  [priority dot]  Unit #1023  ·  John D.  ·  2h ago         │
│  [Critical badge] [Driver Submitted badge] Brake           │
│  "Air leak from front-left brake chamber, audible hiss..." │
│  [Convert to Work Order]   [Acknowledge]                   │
├────────────────────────────────────────────────────────────┤
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

- Card wrapper: `rounded-lg border` with left border accent in `destructive` when any critical report present, `warning` when only high, `border` otherwise.
- Each row shows: Truck unit number (with `onClick` → `onViewTruck`), driver name, relative date (`formatDistanceToNow`), `Priority` color-coded badge (critical=destructive, high=amber, medium=blue, low=muted), an outlined "Driver Submitted" badge, the issue type chip, and the description (clamped to 2 lines with hover/expand).
- Actions per row: **Convert to Work Order** (primary), **Acknowledge** (ghost) — the latter just marks acknowledged without converting, useful when staff want to triage first.
- Hides itself entirely when there are zero submitted/acknowledged reports (no empty-state noise).
- Skeleton row while loading.

## 5. Wire into Active Work Orders tab — `src/components/maintenance/ActiveWorkOrdersTab.tsx`

Render `<DriverFaultReportsPanel onViewTruck={onViewTruck} />` as the first child of the existing `<div className="space-y-4">`, above the summary strip. Layout, filters, and table stay exactly as redesigned in the prior change. This satisfies the brief's option (b) — surfacing reports in the Active Work Orders stream with a clear "Driver Submitted" badge — while keeping them visually distinct as a dedicated incoming panel.

## What does NOT change

- Driver dashboard form's UX, fields, validation.
- `work_orders` table schema or the existing Active Work Orders filtering/redesign.
- Other maintenance tabs (PM Schedule, Predictive, Service History).
- All other RLS policies on `maintenance_requests`.

## Files touched

- **DB migration** — trigger + 2 new RLS policies for `maintenance` role.
- `src/components/driver/MaintenanceRequestForm.tsx` — surface server errors via `.select().single()`.
- `src/hooks/useDriverFaultReports.ts` — **new**.
- `src/components/maintenance/DriverFaultReportsPanel.tsx` — **new**.
- `src/components/maintenance/ActiveWorkOrdersTab.tsx` — mount the panel at the top.
