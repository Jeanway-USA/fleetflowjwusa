## Problem
Deleting a truck fails with:
`update or delete on table "trucks" violates foreign key constraint "driver_requests_truck_id_fkey" on table "driver_requests"`

The `driver_requests.truck_id` foreign key has no `ON DELETE` action, so any historical driver request (time-off, maintenance, etc.) referencing a truck blocks deletion.

## Fix
Migration to drop and re-add the FK with `ON DELETE SET NULL`, so historical driver requests are preserved but no longer block truck deletion.

```sql
ALTER TABLE public.driver_requests
  DROP CONSTRAINT driver_requests_truck_id_fkey,
  ADD  CONSTRAINT driver_requests_truck_id_fkey
       FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE SET NULL;
```

## Scope
- Single migration. No app/UI changes.
- Will also audit other FKs to `trucks` (e.g. `trailer_assignments`, `maintenance_requests`, `work_orders`, `fleet_loads`, `fuel_purchases`, `driver_locations`, `incidents`, `maintenance_logs`, `pm_notifications`, `service_schedules`) and apply `ON DELETE SET NULL` to any that currently block deletion with no action, so this class of error doesn't keep popping up per table. Active references (e.g. an in-progress load) will still need user action — only the FK action is being relaxed; not the business rules.
