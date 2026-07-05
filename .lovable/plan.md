## Sidebar Navigation Routing Fix

### Problem
The FLEET CARE section contains a redundant **PM Schedules** link that routes to `/maintenance-home` — the same high-level dashboard already accessible from the top **Dashboards** section. This creates a navigation loop and confusion.

### Changes

#### 1. `src/components/layout/AppSidebar.tsx`
- **Remove** the `PM Schedules` item from the `fleetCareItems` array (line ~233).
- Keep `Maintenance` in FLEET CARE pointing to `/maintenance` (already correct — defaults to Active Work Orders tab).
- Keep `Maintenance View` in the top Dashboards section pointing to `/maintenance-home` (already correct — high-level metrics dashboard).

#### 2. Verify tab default
- Confirm `/maintenance` (no `tab` query param) renders the **Active Work Orders** tab by default. This is already handled in `MaintenanceManagement.tsx`.

### Out of Scope
- No database changes.
- No RLS or role changes.
- No new pages or routes.
- No changes to `App.tsx` or `ProtectedRoute` logic.