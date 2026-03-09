

## QoL Improvements Across All Areas

### 1. Dynamic Period Selector (Finance)
The Finance page has hardcoded period options (`Q1 2026`, `January 2026`, etc.). This should dynamically generate periods based on the actual data range so it stays relevant as time passes without manual code updates.

**File:** `src/pages/Finance.tsx`
- Scan the `expenses` and `loads` date fields to determine the earliest and latest dates in the dataset
- Auto-generate monthly and quarterly period options from that range up to the current date
- Default to the current month instead of a hardcoded quarter

### 2. Expense Table Pagination / Virtualization (Finance)
The expense table renders all rows at once. For users with hundreds of imported expenses, this causes slow rendering.

**File:** `src/pages/Finance.tsx`
- Add simple client-side pagination (e.g., 50 rows per page) with Previous/Next controls and a row count indicator below the table
- Use existing `@tanstack/react-virtual` (already installed) or simple slice-based pagination

### 3. Breadcrumb Navigation in Header (Overall UX)
The top header bar (`DashboardLayout`) currently has only a sidebar trigger and empty space. Adding breadcrumbs improves orientation, especially on deeper pages.

**Files:** `src/components/layout/DashboardLayout.tsx`
- Use the existing `Breadcrumb` UI component (already in `src/components/ui/breadcrumb.tsx`)
- Map current `location.pathname` to a human-readable breadcrumb trail (e.g., `Finance > Expenses`, `Fleet > Trucks`)
- Display in the header alongside the sidebar trigger

### 4. Keyboard Shortcut for Sidebar Toggle (Overall UX)
Add a `Ctrl+B` / `Cmd+B` keyboard shortcut to toggle the sidebar, matching common app conventions.

**File:** `src/components/layout/DashboardLayout.tsx`
- Add a `useEffect` with a keydown listener that calls the sidebar toggle from `useSidebar()`

### 5. Confirm Before Single Expense Delete (Finance)
Currently, clicking the trash icon on a single expense row immediately deletes without confirmation. Mass delete has a confirmation dialog but single delete does not.

**File:** `src/pages/Finance.tsx`
- Add a `deleteConfirmId` state
- Show the existing `ConfirmDeleteDialog` before executing `deleteExpenseMutation`

### 6. Pull-to-Refresh on Driver Dashboard (Driver)
The driver dashboard is a mobile-first view. Add a manual refresh button in the header so drivers can re-fetch active loads without navigating away.

**File:** `src/pages/DriverDashboard.tsx`
- Add a `RefreshCw` icon button next to the date display
- On click, invalidate the key queries (`driver-active-loads`, `driver-weekly-loads`, etc.) and show a brief loading indicator

### 7. Dispatcher Quick-Assign Improvement (Dispatcher)
The FleetMapView + DriverAssignmentPanel + Alerts row uses `lg:grid-cols-3` which can feel cramped. On medium screens it stacks all 3 vertically.

**File:** `src/pages/DispatcherDashboard.tsx`
- Change the map/assignment/alerts grid to `md:grid-cols-2 lg:grid-cols-3` so on medium screens, map and assignment sit side-by-side with alerts below

### 8. Sidebar Active State on Nested Routes (Overall UX)
The sidebar only highlights exact path matches (`location.pathname === item.path`). If a user is on `/driver-view/abc123`, no sidebar item highlights.

**File:** `src/components/layout/AppSidebar.tsx`
- Change `isActive` check to use `startsWith` for paths that have sub-routes (e.g., `/driver-view` should highlight "Driver Performance")

### Files Modified
- `src/pages/Finance.tsx` (dynamic periods, pagination, delete confirmation)
- `src/components/layout/DashboardLayout.tsx` (breadcrumbs, keyboard shortcut)
- `src/pages/DriverDashboard.tsx` (refresh button)
- `src/pages/DispatcherDashboard.tsx` (responsive grid)
- `src/components/layout/AppSidebar.tsx` (nested route highlighting)

