

## Plan: Responsive Dashboard Grids & KPI Cards

Most dashboard grids were already improved in prior passes. This targets the remaining hardcoded grids that lack explicit `grid-cols-1` for mobile stacking.

### Changes

**1. `src/pages/DispatcherDashboard.tsx`**
- Line 158 stats grid: `grid-cols-2 lg:grid-cols-4` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (stack on narrow phones)

**2. `src/components/maintenance/MaintenanceKPICards.tsx`**
- Line 15: `md:grid-cols-2 lg:grid-cols-4` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

**3. `src/components/dispatcher/DriverStatusGrid.tsx`**
- Line 84 (skeleton): `grid-cols-2 lg:grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

**4. `src/components/dispatcher/TruckStatusGrid.tsx`**
- Line 62 (skeleton): `grid-cols-2 lg:grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

**5. `src/components/dispatcher/UpcomingPickups.tsx`**
- Lines 80 and 114: `md:grid-cols-2 lg:grid-cols-3` → `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (explicit single-col mobile)

**6. `src/components/maintenance/NewWorkOrderSheet.tsx`**
- Line 548: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` (form fields stack on mobile)

**7. `src/components/maintenance/TruckHistoryDrawer.tsx`**
- Line 93: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` (stats cards stack)

All changes are Tailwind class-only — no logic changes.

