## Inventory Alerts widget + responsive polish

### 1. New backend table: `parts_inventory`

Migration creates a multi-tenant inventory table mechanics can manage.

Columns:
- `id`, `org_id`, `created_at`, `updated_at`
- `part_number` (text, nullable) — e.g. `15W40-55GAL`
- `part_name` (text, required) — e.g. "15W-40 Engine Oil"
- `category` (text, nullable) — e.g. "Fluids", "Filters", "Brakes"
- `quantity_on_hand` (numeric, default 0)
- `min_threshold` (numeric, default 0) — reorder trigger level
- `unit` (text, default 'ea') — ea / qt / gal / box
- `reorder_url` (text, nullable) — optional vendor link
- `reorder_requested_at` (timestamptz, nullable) — set when "Reorder" clicked
- `notes` (text, nullable)

GRANTs: `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` (ALL). No anon.

RLS policies (org-scoped via `get_user_org_id`):
- Maintenance + dispatcher + owner can manage (ALL)
- Operations (`has_operations_access`) and safety (`has_safety_access`) can SELECT

`updated_at` trigger using existing `update_updated_at_column()`.

Seed ~6 rows for the demo org (`a0000000-0000-0000-0000-000000000001`): 15W-40 Oil, Air Filters, Fuel Filters, Brake Pads, DEF Fluid, Wiper Blades — with a mix of below-threshold and healthy stock so the widget shows real alerts in demo mode.

### 2. New hook in `src/hooks/useMaintenanceData.ts`

- `PartInventoryItem` type
- `useLowStockParts()` — selects parts where `quantity_on_hand <= min_threshold`, ordered by severity (0 first, then ratio), limit 8. Standard 5m staleTime, `refetchOnWindowFocus: false`.
- `useRequestReorder()` mutation — stamps `reorder_requested_at = now()` for a given part id, invalidates the query, toasts success.

### 3. `MaintenanceDashboardHome.tsx` — new `InventoryAlertsCard`

Card styling consistent with `LiveDriverAlertsCard` but amber/warning-tinted (`border-amber-500/40`, `Package` icon header, "Below minimum threshold" caption). Inside:
- Minimalist `<Table>`: Part (name + small muted part_number), Category badge, Qty (red text when 0, amber when ≤ threshold, format `X / Y unit`), Action ("Reorder" ghost button → `useRequestReorder`, or "Requested" muted text if `reorder_requested_at` set within last 7 days)
- Loading: 3 `Skeleton` rows. Empty: `CheckCircle2` green "All parts stocked".
- Footer link: "Manage inventory" → `/maintenance?tab=inventory` (link is harmless even if tab doesn't exist yet).

### 4. Layout & responsive polish

Rework the grid so everything collapses cleanly:
- KPI row: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4` (already similar — verify gap consistency)
- Middle row (Priorities + Live Alerts): `grid-cols-1 lg:grid-cols-3 gap-4` with Priorities `lg:col-span-2`
- Bottom row (Upcoming PM + Inventory Alerts): `grid-cols-1 lg:grid-cols-3 gap-4` with Upcoming PM `lg:col-span-2`, Inventory Alerts in the third column
- Quick Actions: full-width below, with internal `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` so the 4 buttons sit in a row on desktop instead of stacking
- Outer page wrapper: `space-y-4 sm:space-y-6 p-4 sm:p-6` for uniform breathing room
- All cards share the same `CardHeader` paddings, `CardTitle` size (`text-base font-semibold`), and `text-xs text-muted-foreground` captions — pass over each component and align

No changes to KPI calculations, existing hooks, sidebar, routing, or `/maintenance`.

### Files touched
- New migration: `parts_inventory` table + RLS + seed
- `src/hooks/useMaintenanceData.ts` — add type, `useLowStockParts`, `useRequestReorder`
- `src/pages/MaintenanceDashboardHome.tsx` — add `InventoryAlertsCard`, restructure bottom grid, tighten spacing/typography across all sub-cards