## Context

The `parts_inventory` table already exists and the Inventory Alerts widget already uses real Supabase data via `useLowStockParts()` — there is no mock array left to remove. What's missing relative to your spec are two fields: **`vendor_name`** (where the part was purchased) and **`last_restocked`** (timestamp of most recent restock).

Existing column names differ slightly from your spec but map cleanly:
- `quantity_on_hand` ↔ `quantity`
- `min_threshold` ↔ `minimum_threshold`

I'll keep the existing names to avoid breaking the seeded data, hook, and widget, and just add the two new columns.

## Plan

### 1. Database migration
Add to `public.parts_inventory`:
- `vendor_name text` (nullable)
- `last_restocked timestamptz` (nullable)
- Index on `(org_id, last_restocked desc)` for future "recently restocked" queries.

Backfill `last_restocked = created_at` for existing rows so the UI doesn't show "Never" for seeded items, and set a reasonable `vendor_name` (e.g. `'NAPA Auto Parts'`, `'FleetPride'`) on the seeded demo rows.

No RLS/grants changes needed (table already correctly configured).

### 2. Types
`src/integrations/supabase/types.ts` regenerates automatically after migration — no manual edit.

Update `PartInventoryItem` in `src/hooks/useMaintenanceData.ts` to include:
```ts
vendor_name: string | null;
last_restocked: string | null;
```

### 3. Hook (`useLowStockParts`)
- Add `vendor_name, last_restocked` to the `.select(...)` columns.
- Query already filters `quantity_on_hand <= min_threshold` — no logic change.

### 4. Widget (`InventoryAlertsCard` in `MaintenanceDashboardHome.tsx`)
- Add a small **Vendor** line under each part name (muted text, e.g. `"NAPA Auto Parts · Restocked 12 days ago"`).
- Use `date-fns` `formatDistanceToNow` for the restock relative date; fall back to `"Not restocked yet"` when null.
- No layout / responsive changes — the widget already fits the existing grid.

### 5. Verification
After migration, confirm via a quick `select` that the new columns are populated for the demo org, and visually check the widget at `/maintenance-dashboard`.

## Files touched
- New migration (adds 2 columns + index + seed backfill)
- `src/hooks/useMaintenanceData.ts` (extend type + select)
- `src/pages/MaintenanceDashboardHome.tsx` (render vendor + last restocked)

## Out of scope
- Renaming `quantity_on_hand` → `quantity` or `min_threshold` → `minimum_threshold` (would break the existing hook, seeded data, and any future inventory pages). Let me know if you want a strict rename instead — I'd do it as a separate migration with a code sweep.