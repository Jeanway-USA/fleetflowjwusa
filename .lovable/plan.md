# Global Search Enhancement

The existing `CommandPalette` (mounted globally, ⌘K + `/` hotkeys, wired through `TopBar`'s search button) already covers most of the request. This plan closes the gaps.

## Changes

### 1. `src/components/shared/CommandPalette.tsx` — expand queries

Add a **Trailers** category and broaden field coverage. All queries stay `.eq('org_id', orgId)` + `.limit(6)` so RLS + performance are unaffected.

- **Drivers** — search `first_name`, `last_name`, `email`, `phone`, `cdl_number`. No SSN.
- **Trucks** — search `unit_number`, `vin`, `make`, `model`, `license_plate`.
- **Trailers** (new) — search `unit_number`, `vin`, `license_plate`. Navigate to `/trailers?highlight=<id>`.
- **Loads** — add `customer_name`, `broker_name`, `po_number`, `reference_number` to the existing `landstar_load_id`/`agency_code`/`origin`/`destination` `.or(...)` filter (only columns that exist on `fleet_loads` — I'll verify against the schema at build time and drop any that don't).
- **Contacts** — keep existing (already covers customers, brokers, agents via `crm_contacts`).

Each `.or()` clause stays a single string literal (no dynamic concatenation of select columns) so supabase-js type parsing stays cheap per the query-builder-type-performance rule.

### 2. Navigate + highlight (no auto-open sheet)

Switch result URLs from `?id=` to `?highlight=<id>` for drivers, trucks, trailers. Loads keep `?load=<id>` (existing detail-sheet behavior on that page is out of scope). Contacts keep `?id=<id>`.

Add a small `useHighlightRow(id)` behavior on the three list pages (`Drivers`, `Trucks`, `Trailers`):
- Read `?highlight=` from the URL.
- Scroll the matching row into view (`element.scrollIntoView({ block: 'center' })`).
- Apply a temporary `data-highlight="true"` ring (`ring-2 ring-primary/60 bg-primary/5`) that fades after ~2.5s.
- Clear the query param after applying so refreshes don't re-trigger.

Implemented as one shared hook in `src/hooks/useHighlightRow.ts` + a `data-row-id={row.id}` attribute on the existing table rows in the three pages.

### 3. TopBar — no changes needed

`TopBar.tsx` already dispatches `open-command-palette` and shows the ⌘K hint; no edits.

## Out of scope

- No new indexes / migrations. Existing `ilike` queries on limited `.eq(org_id)` result sets are fast enough for typical org sizes; revisit only if slow-query logs flag them.
- No SSN / sensitive PII search.
- No changes to load detail routing, CRM, or sidebar.

## Technical notes

- `useHighlightRow` uses `useSearchParams` and `useEffect` with a `MutationObserver` fallback so late-rendered rows (after React Query resolves) still get highlighted.
- Trailer query and category use existing `Truck` icon (matches sidebar convention).
- All new fields are searched case-insensitively via `ilike`.
