# Fleet Loads Omni-Search

## Schema reality check

The spec references columns that don't exist on `fleet_loads`. Actual relevant fields:

- `landstar_load_id` (not `load_number`)
- `origin`, `destination` — single strings like `"Dallas, TX"` (no separate city/state)
- `status`, `notes`, `pickup_number`
- No `shipper_name` / `receiver_name` columns
- Driver and truck are loaded via **separate queries** (`drivers`, `trucks`) and joined client-side into `driver_name` / `truck_unit` on `enrichedLoads` — there is no PostgREST FK embed in this page

Because of this, a server-side `.or()` with foreign-table `ilike` on driver name **would require restructuring the data layer** (switching to an embedded select like `fleet_loads.select('*, drivers(first_name,last_name), trucks(unit_number)')`). The loads list is already fully in memory and enriched, so a client-side filter is faster, simpler, and covers every requested field including driver name.

## Plan — client-side debounced omni-search

### 1. `src/pages/FleetLoads.tsx` — search state + UI
- Add `const [searchInput, setSearchInput] = useState('')` and `const [searchTerm, setSearchTerm] = useState('')`.
- Debounce input → searchTerm with `useDebouncedCallback` (300 ms) from existing `src/hooks/useDebouncedCallback.ts`.
- Render a full-width `Input` above the DataTable with `leftIcon={<Search />}` (uses the new icon-aware Input from the previous patch — no padding fight). Include a small `X` clear button (right side) when `searchInput` is non-empty.
- Place the search bar in the same toolbar row as the existing month `Select`, stacking on mobile.

### 2. Filter logic — extend existing `filteredLoads`
Apply the search filter **after** month filtering, **against `enrichedLoads`** so `driver_name` and `truck_unit` are already populated:

```text
matches(load, q) =
  any field in [
    landstar_load_id, origin, destination, status, notes,
    pickup_number, driver_name, truck_unit
  ] contains q (case-insensitive)
```

Implementation: reorder so enrichment happens before the search filter, then filter once on the lower-cased term. Keep `totals` and downstream `enrichedLoads` consumers pointing at the final filtered array so KPI totals reflect the visible rows.

### 3. Zero-state
- When `searchTerm` is non-empty AND `filteredLoads.length === 0`, render an `EmptyState` inside the table card area: `"No loads found matching \"<term>\""` with a `Clear Search` button that resets both `searchInput` and `searchTerm`.
- Existing DataTable empty-state stays for the "no loads at all" case (no search term).

### Out of scope
- No schema changes, no new columns (`shipper_name`/`receiver_name`/`origin_city` etc. don't exist).
- No switch to server-side `.or()` filtering or PostgREST FK embeds — would require refactoring the drivers/trucks fetch pattern and offers no UX gain at current data volumes. Happy to do it as a follow-up if you want server-side filtering for very large fleets.
- No changes to mutation/edit logic.

## Files touched
- `src/pages/FleetLoads.tsx` (only)
