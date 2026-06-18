## Goal
Make the Fleet Loads board organizable by assigned Driver and Truck Number — visible columns, sortable headers, and dedicated filters.

## Current state (already in code)
- `FleetLoads.tsx` fetches `fleet_loads.*` (which already includes `driver_id` and `truck_id`) and separately loads `drivers` (`drivers_public_view`) and `trucks`. Helpers `getDriverName(load.driver_id)` and `getTruckUnit(load.truck_id)` already exist.
- Table is rendered via the shared `DataTable` component (`src/components/shared/DataTable.tsx`), which supports per-column text/date filters but currently has **no sortable headers**.

So the join work for Task 1 is effectively done — driver/truck data is already on the client. We just need to wire it into the visible row data so columns, sorting, and filtering all work off the same field.

## Changes

### 1. `src/pages/FleetLoads.tsx`
- Compute a memoized `enrichedLoads` from the filtered-by-month list that adds two derived strings per row:
  - `driver_name` = `getDriverName(load.driver_id)` or `'Unassigned'`
  - `truck_unit` = `getTruckUnit(load.truck_id)` or `'Unassigned'`
- Feed `enrichedLoads` into `DataTable` (replacing `filteredLoads` there; totals stay on the existing array).
- Add two new columns right after `status` (Status is the most visible anchor and keeps the actions column at the end):
  - `{ key: 'driver_name', header: 'Driver', sortable: true, filter: { type: 'text', accessor: (l) => l.driver_name } }`
  - `{ key: 'truck_unit', header: 'Truck #', sortable: true, filter: { type: 'text', accessor: (l) => l.truck_unit } }`
- Render cells with muted styling for `Unassigned`.

### 2. `src/components/shared/DataTable.tsx`
Add lightweight client-side sorting (the table is already client-paginated/virtualized):
- Extend `Column<T>` with `sortable?: boolean` and optional `sortAccessor?: (item: T) => string | number | null | undefined` (defaults to `item[key]`).
- Add `sortState: { key: string; dir: 'asc' | 'desc' } | null` state.
- Wrap the `<th>` label in a button for sortable columns; clicking cycles `asc → desc → none`. Show an up/down chevron from `lucide-react` (`ArrowUp`, `ArrowDown`, `ChevronsUpDown`).
- Apply sort in a `useMemo` **after** the existing column-filter step and **before** virtualization, using locale-aware string compare and numeric compare for numbers; nulls/`Unassigned` always sort last.
- No prop signature changes for existing callers — `sortable` is opt-in.

### 3. Filtering UX
- The existing "Filters" panel already renders text inputs for any column with `filter: { type: 'text' }`. Adding the filter spec on the new columns gives dispatchers a **Filter by Driver** and **Filter by Truck** input out of the box, matching the look of the other filters on this page.

## Out of scope
- No DB migration or query changes (driver_id/truck_id already exist on `fleet_loads`; drivers/trucks are already fetched).
- No changes to server-side pagination — table is client-side today, so sort/filter stay client-side per the task's "client-side pagination" branch.
- No changes to the mobile `DriverLoadsView` (driver-only view).
- Other tables that use `DataTable` are unaffected because `sortable` is opt-in.
