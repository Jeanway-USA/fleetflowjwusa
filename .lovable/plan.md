## Goal

Add a **Maintenance Staff** user role and surface a "Maintenance View" entry in the Dashboards section of the sidebar, with the same owner role-simulation pattern as the other dashboard views.

## 1. Database — new role enum value

Migration adds `'maintenance'` to the `public.app_role` enum.

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'maintenance';
```

No new tables, no RLS changes. Existing `user_roles` rows are unaffected; assigning the new role is done from the team-management UI (already enum-driven).

After approval, `src/integrations/supabase/types.ts` will regenerate to include `'maintenance'` automatically.

## 2. Routing — make `/maintenance` reachable for the new role

In `src/App.tsx`, extend the `/maintenance` route's `allowedRoles` to include `'maintenance'`:

```tsx
<ProtectedRoute allowedRoles={['owner', 'safety', 'maintenance']} requiredFeature="maintenance_full">
  <MaintenanceManagement />
</ProtectedRoute>
```

In `src/components/shared/RoleBasedRedirect.tsx`, add a branch so a real maintenance user lands on `/maintenance`:

```tsx
if (hasRole('maintenance')) {
  return <Navigate to="/maintenance" replace />;
}
```

## 3. Sidebar — move Maintenance into the Dashboards group

In `src/components/layout/AppSidebar.tsx`:

- **Owner view of Dashboards** — add a fourth entry alongside Executive / Dispatcher / Driver:
  ```ts
  { title: 'Maintenance View', icon: Wrench, path: '/maintenance', roles: ['owner'] }
  ```
- **Non-owner view of Dashboards** — add a `My Dashboard` entry for the maintenance role:
  ```ts
  { title: 'My Dashboard', icon: Wrench, path: '/maintenance', roles: ['maintenance'] }
  ```
- **Remove** the existing `Maintenance` item from the `operationsItems` array (it's moving up into Dashboards, per the request).
- **Role-simulation map** — extend `pathToRole` so owners flipping to the Maintenance View toggle the simulated role:
  ```ts
  const pathToRole: Record<string, 'owner' | 'dispatcher' | 'driver' | 'maintenance'> = {
    '/executive-dashboard': 'owner',
    '/dispatcher-dashboard': 'dispatcher',
    '/driver-dashboard': 'driver',
    '/maintenance': 'maintenance',
  };
  ```
  Update `handleDashboardSwitch`'s signature to accept `'maintenance'` as well, and call `setSimulatedRole('maintenance')` when an owner clicks the Maintenance View entry. Switching back to Executive View clears the simulation as today.
- **Simulation banner exit** — already navigates to `/executive-dashboard`; no change needed.

The new entry uses the `Wrench` icon (already imported) and the same `SidebarMenuButton` styling as the other dashboard items, so layout/active-state visuals stay consistent.

## 4. Tier gating

`maintenance_full` is already included in `open_beta`, `fleet_owner`, and `all_in_one` tier feature sets, so the new dashboard entry will appear for the same tiers that already expose maintenance. No tier changes.

## 5. Out of scope

- No changes to the `MaintenanceManagement` page itself — it already renders the full dashboard.
- No changes to data-access RLS — the maintenance role is purely a navigation/role-switching addition; any existing maintenance-related RLS that needs to recognise the new role can be addressed in a follow-up if you want maintenance users to read/write specific tables beyond what `safety` already grants.

## Files touched

- new migration: add `'maintenance'` to `app_role`
- `src/App.tsx` — allow `'maintenance'` on `/maintenance`
- `src/components/shared/RoleBasedRedirect.tsx` — redirect maintenance users to `/maintenance`
- `src/components/layout/AppSidebar.tsx` — move Maintenance into Dashboards group, wire role simulation
