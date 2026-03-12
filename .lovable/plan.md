

## Plan: Actionable Empty States for Data Tables

### Current State
- `EmptyState.tsx` already exists with icon, title, description, and action button support
- `DataTable` shows a plain `<p>` tag when empty — no icon, no action button
- `Drivers.tsx` already uses `EmptyState` directly (doesn't use `DataTable`)
- Pages using `DataTable` (Trucks, FleetLoads, Trailers, etc.) only pass a string `emptyMessage`

### Changes

**1. `src/components/shared/DataTable.tsx`** — Add rich empty state props

Add optional props to the `DataTableProps` interface:
- `emptyIcon?: LucideIcon`
- `emptyAction?: { label: string; onClick: () => void }`

Update the empty state render block (lines 237-241) to use the `EmptyState` component when data is empty, passing `emptyMessage` as the title and the new optional props.

**2. `src/pages/Trucks.tsx`** — Pass empty state config to DataTable

Add `emptyIcon={Truck}` and `emptyAction={{ label: 'Add First Truck', onClick: openAddDialog }}` to the DataTable usage.

**3. `src/pages/FleetLoads.tsx`** — Pass empty state config to DataTable

Add `emptyIcon={Package}` (or similar) and `emptyAction={{ label: 'Add First Load', onClick: openAddDialog }}`. Update `emptyMessage` to be more descriptive.

**4. `src/pages/Drivers.tsx`** — Already handled

This page already renders `EmptyState` with icon and action. No changes needed.

**5. Other DataTable consumers** — Update copy for these pages with better messages:
- `Trailers.tsx`: Add icon and action
- `AgencyLoads.tsx`: Add icon
- `Incidents.tsx`: Add icon
- `Documents.tsx`: Add icon and action

### Summary
The main work is adding two optional props to `DataTable` and wiring the `EmptyState` component into its empty render path. Then each page passes contextual icon/action/copy. Approximately 6-8 files touched with small prop additions.

