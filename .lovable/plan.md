# Enable Maintenance edits on Trucks & Trailers

## Finding

`src/pages/Trucks.tsx` and `src/pages/Trailers.tsx` have **no role-gated UI** — every action button (Edit, Update Status, three-dot menu, Log Service) renders for any user who can load the page. So there's nothing to flip in the UI conditionals.

The real blocker is **Row-Level Security**. Today the policies on `public.trucks` and `public.trailers` are:

- **SELECT** — allowed only via `has_admin_access` (owner/payroll_admin/dispatcher/safety), `has_safety_access`, `has_operations_access`, or driver-of-record. **`maintenance` is in none of them.**
- **ALL (write)** — `Owner dispatcher safety can manage trucks/trailers`. Maintenance is excluded.

So a maintenance user opening `/trucks` today would see an empty list, and any edit would fail with an RLS violation.

## Change — single migration

Add two new RLS policies per table allowing the `maintenance` role to read and update rows within their own org. INSERT and DELETE intentionally remain owner/dispatcher/safety only (maintenance shouldn't be provisioning or removing assets, only maintaining the ones the fleet team registers).

```sql
-- TRUCKS: maintenance can view
CREATE POLICY "Maintenance can view all trucks"
ON public.trucks
FOR SELECT
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
);

-- TRUCKS: maintenance can update (status, mileage, next_inspection_date, etc.)
CREATE POLICY "Maintenance can update trucks"
ON public.trucks
FOR UPDATE
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
);

-- TRAILERS: same pattern
CREATE POLICY "Maintenance can view all trailers"
ON public.trailers
FOR SELECT
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Maintenance can update trailers"
ON public.trailers
FOR UPDATE
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
);
```

## No code changes

`src/pages/Trucks.tsx`, `src/pages/Trailers.tsx`, and their child components don't gate buttons by role, so no edits are needed there. The existing `useUpdateTruckStatus`, edit dialogs, and inline status changes will all succeed for maintenance users once the policies above are in place.

## Verification

1. Sign in as a maintenance user (or simulate the role from an owner account).
2. `/trucks` lists the fleet; click **Edit** on a truck, change mileage and status, save — no RLS error, toast confirms save.
3. `/trailers` same flow.
4. Confirm the **+ New Truck** / **+ New Trailer** create action is still blocked (expected — INSERT not granted to maintenance).

## Out of scope

- Granting INSERT/DELETE to maintenance — say the word and I'll add it.
- Any changes to `service_schedules`, `work_orders`, `maintenance_logs`, or `parts_inventory` policies — those already allow the maintenance role.
