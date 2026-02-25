

## Fix: `fleet_loads_status_check` Constraint Missing Extended Statuses

### Problem
The database check constraint `fleet_loads_status_check` only allows 6 statuses:
`pending, assigned, loading, in_transit, delivered, cancelled`

But the Fleet Loads UI offers 9 statuses including `at_pickup`, `at_delivery`, and `unloading`. Selecting any of these three causes the Postgres error shown in the screenshot.

### Root Cause
The constraint was created in migration `20260119...` with only the original 6 statuses. When the extended statuses were added to the UI later, no migration was created to update the constraint.

### Fix

**Single database migration** to drop and recreate the check constraint with all 9 statuses:

```sql
ALTER TABLE public.fleet_loads DROP CONSTRAINT IF EXISTS fleet_loads_status_check;

ALTER TABLE public.fleet_loads ADD CONSTRAINT fleet_loads_status_check
CHECK (status IN (
  'pending', 'assigned', 'at_pickup', 'loading',
  'in_transit', 'at_delivery', 'unloading',
  'delivered', 'cancelled'
));
```

No frontend code changes needed -- the UI already has the correct status options.

### Files Changed

| File | Action |
|------|--------|
| Database migration | Update `fleet_loads_status_check` to include all 9 statuses |

