## Goal
Make `DataTable` a true bulk-ops table (selection already exists), then apply it to active loads and expenses with real bulk mutations.

## 1. `src/components/shared/DataTable.tsx` — upgrades
Selection + `bulkActions` prop are already implemented. Add:

- **Screen-floating action bar**: replace the in-container sticky bar with a `fixed bottom-6 left-1/2 -translate-x-1/2 z-50` card (rounded, `bg-background border shadow-lg`, animated `slide-in-from-bottom`). Shows count, Clear button, and `bulkActions(selectedIds)`. Rendered via a portal-less `fixed` div so it floats over the whole viewport.
- **Column filters**: extend `Column<T>` with `filter?: { type: 'text' } | { type: 'date-range'; accessor: (item: T) => string | null }`. Render a second header row with `<Input>` for text columns and two compact date inputs (from / to) for date-range columns. Filter state held internally (`Record<string, string | { from?: string; to?: string }>`); data is filtered before being passed to the virtualizer. Add a small "Clear filters" link when any filter is active. Hide the filter row behind a `Filter` toggle button in the toolbar (off by default to avoid noise on tables that don't need it).
- Keep all existing behavior (density, column visibility, CSV export, virtualization, double-click).

## 2. Database — `expenses.is_approved`
Migration adds:
- `is_approved boolean not null default false`
- `approved_at timestamptz`
- `approved_by uuid` (no FK to `auth.users`)
- Index on `(org_id, is_approved)`

No RLS changes — existing `Owner payroll can access expenses` policy already covers UPDATEs.

## 3. `src/components/dispatcher/ActiveLoadsBoard.tsx`
- Add a `view` state (`'cards' | 'table'`) with a segmented toggle in the card header (Cards / Table icons).
- Keep existing card rendering for `'cards'`.
- For `'table'`, render the upgraded `DataTable` with columns: checkbox, Load #, Origin, Destination, Driver, Truck, Pickup (date-range filter), Status (text filter), Rate, RPM. `selectable`, `selectedIds` state, `bulkActions={(ids) => <BulkStatusMenu ids={ids} />}`.
- `BulkStatusMenu`: shadcn `DropdownMenu` with items `Assigned`, `Loading`, `In Transit`, `Unloading`, `Delivered`, `Cancelled`. On click, run `useMutation` doing `supabase.from('fleet_loads').update({ status }).in('id', [...ids])`, toast result, invalidate `['active-loads-dispatcher']`, clear selection.
- Keep the existing details Dialog (open via row click in table view).

## 4. `src/components/shared/ExpensesList.tsx`
- Replace the plain `<Table>` with `DataTable`. Columns: checkbox, Date (date-range filter), Type (text filter), Vendor (text filter), Amount, Gallons, Approved (badge: `Pending` / `Approved`), Actions (existing delete button). Keep totals row by rendering a footer below the table using the filtered totals (compute from same filter state isn't accessible from outside — simplest: show "Total" using full `expenses` total above the table; sufficient for this scope).
- `selectedIds` state. `bulkActions={(ids) => (<><Button onClick={approveAll}>Approve N</Button><Button variant="outline" onClick={unapproveAll}>Mark pending</Button></>)}`.
- `approveMutation`: `supabase.from('expenses').update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: (await supabase.auth.getUser()).data.user?.id }).in('id', [...ids])`. Invalidate `queryKey` + `['expenses']`. Toast, clear selection.

## Technical notes
- Filtering happens client-side inside `DataTable` (data sets here are bounded — active loads, per-load/truck expenses).
- Date-range comparison uses ISO strings (`YYYY-MM-DD`) — both query value and column accessor produce that shape; lexicographic compare is correct.
- Floating bar uses semantic tokens only (`bg-background`, `border-border`, `text-foreground`, `text-muted-foreground`) per the design system. No `text-white` / hex colors.
- Memory rule respected: when parsing `expense_date` strings for the date-range accessor, no parsing needed (string compare on `YYYY-MM-DD`).

## Files touched
- edit `src/components/shared/DataTable.tsx`
- edit `src/components/dispatcher/ActiveLoadsBoard.tsx`
- edit `src/components/shared/ExpensesList.tsx`
- new migration: add `is_approved`, `approved_at`, `approved_by` to `expenses`