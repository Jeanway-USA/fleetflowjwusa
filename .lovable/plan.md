## Plan

Make the Inventory tab fully CRUD-capable with proper validation and cache invalidation.

### 1. New mutation hooks in `src/hooks/useMaintenanceData.ts`
All four invalidate both `['all-parts-inventory']` and `['low-stock-parts']` on success so the table and the dashboard alerts widget refresh together.

- `useCreatePart()` — inserts a new `parts_inventory` row. `org_id` is set automatically by the existing RLS policies (the table doesn't have a trigger, so we pass `get_user_org_id` via a `select org_id from profiles` lookup helper… actually the existing seeded inserts in migrations write `org_id` directly. We'll fetch `org_id` once via `supabase.auth.getUser()` → `profiles.org_id` and include it in the insert payload). Also stamps `last_restocked = now()`.
- `useUpdatePart()` — patches `{ part_name?, part_number?, vendor_name?, min_threshold?, category?, unit? }` by id.
- `useReceiveShipment()` — increments `quantity_on_hand` by a positive number and sets `last_restocked = now()` and clears `reorder_requested_at`. Implemented as a fetch-then-update (no RPC) since the dataset is small.
- `useDeletePart()` — deletes by id, with toast confirm in the UI.

### 2. Zod schemas (`src/components/maintenance/InventoryManagementTab.tsx` local file)
```ts
const partSchema = z.object({
  part_name: z.string().trim().min(1, 'Required').max(120),
  part_number: z.string().trim().max(60).optional().or(z.literal('')),
  vendor_name: z.string().trim().max(120).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  unit: z.string().trim().min(1).max(20).default('ea'),
  quantity_on_hand: z.coerce.number().min(0).max(1_000_000),
  min_threshold: z.coerce.number().min(0).max(1_000_000),
});
const receiveSchema = z.object({
  quantity: z.coerce.number().int().positive().max(100_000),
  vendor_name: z.string().trim().max(120).optional().or(z.literal('')),
});
```

### 3. UI additions in `InventoryManagementTab.tsx`

**Header row (above table)** — add a primary `"+ Add New Part"` button on the right of the search bar.

**Three new dialogs** (shadcn `Dialog` with `react-hook-form` + zod):
- `AddPartDialog` — fields: Part Name*, Part Number, Vendor, Category, Unit (default "ea"), Current Quantity*, Min Threshold*. Submit → `useCreatePart`.
- `EditPartDialog` — same fields except quantity (which is managed via Receive Shipment). Pre-fills from selected row.
- `ReceiveShipmentDialog` — fields: Quantity to add*, Vendor (optional override). Shows "Current: {qty} → New: {qty+input}" preview. Submit → `useReceiveShipment`.

**Actions dropdown** — replace the current 4 disabled items with 3 active ones:
- "Receive Shipment" → opens `ReceiveShipmentDialog`
- "Edit Details" → opens `EditPartDialog`
- separator + destructive "Delete Part" → opens an `AlertDialog` confirm → `useDeletePart`

All mutations show toast feedback (`useToast`) and close their dialog on success.

### 4. Cache invalidation
Every mutation `onSuccess` runs:
```ts
queryClient.invalidateQueries({ queryKey: ['all-parts-inventory'] });
queryClient.invalidateQueries({ queryKey: ['low-stock-parts'] });
```
This keeps the dashboard's Inventory Alerts widget in sync with table edits.

### 5. Security
- All form input validated client-side via zod with length caps (no raw `dangerouslySetInnerHTML`, no URL building).
- Server-side enforcement comes from existing RLS: only owner/maintenance/dispatcher in the same org can write to `parts_inventory`.
- `org_id` resolved server-trusted via `profiles` lookup, not from any user input field.

## Files touched
- `src/hooks/useMaintenanceData.ts` — add 4 mutation hooks
- `src/components/maintenance/InventoryManagementTab.tsx` — add header button, 3 dialogs + alert dialog, wire actions

## Out of scope
- Bulk import / CSV upload
- Audit log of who changed what (existing `audit_logs` table not wired for parts)
- Server-side RPC for atomic increment (small dataset, race risk acceptable)