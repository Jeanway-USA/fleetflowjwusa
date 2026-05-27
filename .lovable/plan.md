## Plan

### 1. New hook in `src/hooks/useMaintenanceData.ts`
Add `useAllPartsInventory()` — fetches every row from `parts_inventory` for the org, ordered by `part_name`. Same `PartInventoryItem` type that already includes `vendor_name` and `last_restocked`. 5-min staleTime, no window-focus refetch.

### 2. New component `src/components/maintenance/InventoryManagementTab.tsx`
Self-contained tab using shadcn `Table`, `Input`, `Badge`, `Button`, `DropdownMenu`.

**Search bar (above table)**
- Single `Input` with `Search` icon, placeholder "Search by part name, number, or vendor…"
- Local `useState` for the query, case-insensitive client-side filter across `part_name`, `part_number`, `vendor_name`.
- Right side: result count (e.g. "12 of 47 parts").

**Table columns**
1. **Part** — `part_name` (bold) with `part_number` muted below
2. **Vendor** — `vendor_name` (or "—")
3. **Quantity** — `{quantity_on_hand} {unit}`
4. **Min. Threshold** — `{min_threshold} {unit}`
5. **Status** — Badge:
   - `quantity ≤ 0` → red "Out of Stock"
   - `quantity ≤ min_threshold` → amber "Low Stock"
   - otherwise → green "In Stock"
6. **Actions** — placeholder `DropdownMenu` with disabled "Edit", "Adjust Quantity", "Request Reorder" items (wired later).

**States**
- Loading: 5 `Skeleton` rows
- Empty (no parts at all): centered `Package` icon + "No inventory yet" message
- Empty (filter no match): "No parts match your search"

### 3. Wire into `src/pages/MaintenanceManagement.tsx`
- Import `InventoryManagementTab` and `Package` icon
- Add a 5th `TabsTrigger value="inventory"` with `Package` icon + label "Inventory"
- Add matching `TabsContent value="inventory"` rendering `<InventoryManagementTab />`

No DB or RLS changes — `parts_inventory` and its policies already allow maintenance/dispatcher/owner full management and ops/safety read.

## Files touched
- `src/hooks/useMaintenanceData.ts` (+ `useAllPartsInventory`)
- `src/components/maintenance/InventoryManagementTab.tsx` (new)
- `src/pages/MaintenanceManagement.tsx` (add tab)

## Out of scope (flagged for follow-up)
- Add/Edit/Delete part dialogs and quantity adjustments — placeholder dropdown for now
- Pagination — current dataset is small; can add later if it grows past ~50 rows