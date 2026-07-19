## Fleet Loads Action Bar

Insert a new Action Bar row directly between the KPI grid and the loads `DataTable` in `src/pages/FleetLoads.tsx`, replacing the existing inline search + month filter row.

### Layout
- Flex container: `flex flex-col md:flex-row md:items-center md:justify-between gap-3` — full width, stacks vertically on mobile, splits into left/right groups on `md+`.
- **Left cluster** (`flex-1 flex flex-col sm:flex-row gap-3`):
  - Existing `Input` with `Search` left icon + clear-`X` right icon, placeholder updated to "Search loads by ID or destination…".
  - Existing month `Select` (kept for parity with current filtering).
- **Right cluster** (`flex items-center gap-2`):
  - Primary solid `Button` — "Add Load Manually" with `Plus` icon (reuses the current `openCreate()` handler, moved out of the page header).
  - Outlined secondary `Button variant="outline"` — "Bulk Upload" with `Upload` icon; triggers a hidden `<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">` via ref.

The old "Add Load" button in the page header is removed so the action bar becomes the single source for those actions.

### Bulk Upload (XLSX only)
- Hidden file input `ref={bulkInputRef}` with `accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"` — no CSV formats accepted.
- On change:
  1. Reject anything whose filename doesn't end in `.xlsx` or whose MIME isn't the Excel spreadsheet type → `notify.error("Only .xlsx files are supported")`.
  2. Read the file as `ArrayBuffer` and parse with the already-installed `xlsx` package (`XLSX.read(buf, { type: 'array' })`, `sheet_to_json`).
  3. Map recognized columns (Landstar Load ID, Origin City/State/Zip, Destination City/State/Zip, Pickup Date, Delivery Date, Gross Revenue, Commodity, Weight, Agency Code) to `fleet_loads` insert rows, defaulting missing fields to null.
  4. Insert via existing `supabase.from('fleet_loads').insert(rows)` with `org_id` from context; on success show `notify.success("Imported N loads")` and refresh the query. On per-row failure, surface count of skipped rows.
- No CSV code path, no CSV MIME accepted, and no fallback parser — strictly `.xlsx`.

### Technical notes
- New state: `bulkInputRef = useRef<HTMLInputElement>(null)`, `bulkImporting` boolean for button spinner.
- Reuses existing `notify` helper, `queryClient.invalidateQueries` pattern, and the current `openCreate` flow.
- No schema changes; `xlsx` is already a dependency (used by `parse-landstar-xlsx.ts`).
- Purely presentation + import wiring — no changes to load business logic, KPI math, or table columns.

### Files touched
- `src/pages/FleetLoads.tsx` — remove header "Add Load" button, replace inline search row with the new Action Bar, add bulk upload handler.
