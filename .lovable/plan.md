### Objective
Enforce integer-only inventory counts, make low-stock warnings visually prominent (red), and give maintenance staff a one-click filter for low-stock items.

### Current State
- `parts_inventory.min_threshold` and `quantity_on_hand` already exist as `numeric` (not null, default 0).
- The Inventory tab already computes a "Low Stock" badge, but it renders in amber/yellow.
- The Maintenance Dashboard home page already shows an `InventoryAlertsCard`, also styled in amber.
- No quick-filter button exists to isolate low-stock items in the inventory table.

### What we will change

#### 1. Database — migrate to INTEGER
- Convert `parts_inventory.min_threshold` from `numeric` → `INTEGER`.
- Convert `parts_inventory.quantity_on_hand` from `numeric` → `INTEGER` for consistency.
- Both columns currently contain no fractional values, so the cast is safe.

#### 2. Inventory Tab (`src/components/maintenance/InventoryManagementTab.tsx`)
- **Validation**: change `quantity_on_hand` and `min_threshold` Zod schemas from `z.coerce.number()` to `z.coerce.number().int()` so the UI rejects decimals before they reach the database.
- **Badge styling**: switch the "Low Stock" badge from the current low-opacity amber (`bg-amber-500/15`) to a prominent red style matching the destructive severity used elsewhere in the app (solid red background, white text, or `variant="destructive"`).
- **Quick-filter button**: add a toggle button in the header row (next to the "Add New Part" button) labeled "Show Low Stock Only". When active, the table filters to only parts where `quantity_on_hand <= min_threshold`. The button visually indicates its active state (e.g. pressed/highlighted). The existing text search continues to work on top of this filter.

#### 3. Maintenance Dashboard Home (`src/pages/MaintenanceDashboardHome.tsx`)
- Update the `InventoryAlertsCard` styling from amber (`border-amber-500/40`, `bg-amber-500/5`, `text-amber-600`) to red/destructive tones (`border-destructive/40`, `bg-destructive/5`, `text-destructive`) so low-stock alerts feel urgent and consistent with the new red badge in the inventory table.
- Update the quantity text color inside alert list items from amber to red for low-stock (non-out-of-stock) items.

### Out of scope
- No new columns are needed; `min_threshold` already exists.
- No hook logic changes in `useMaintenanceData.ts`; the existing `useLowStockParts()` and `PartInventoryItem` types already handle integer values fine.
- No RLS/policy changes are needed.

### Files to modify
- `supabase/migrations/` (new migration file)
- `src/components/maintenance/InventoryManagementTab.tsx`
- `src/pages/MaintenanceDashboardHome.tsx`
- Auto-generated `src/integrations/supabase/types.ts` (regenerated after migration approval)