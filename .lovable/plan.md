## Goal

Align **Active Work Orders** and **Service History** tabs with the **PM Schedule** layout pattern so the entire Maintenance Management page reads as one unified surface. All existing functionality (status updates, complete-job modal, edit/delete dropdown, truck drill-in) is preserved.

## PM Schedule pattern to mirror

```text
[Optional alert banner]
[Fleet Health summary strip — clickable status pills + total count]
[Filters row — search input + 1–2 dropdown filters + toggles]
[Data container — rounded-md border > Table > rows]
```

Existing primitives reused: `Input` with left `Search` icon (`pl-10`), `DropdownMenu` + `DropdownMenuRadioGroup` for filters, summary strip styled like `PMFleetHealthSummary` (muted background, clickable pills with red/amber/blue/emerald accents), table wrapped in `rounded-md border`.

## 1. Active Work Orders tab — `src/components/maintenance/ActiveWorkOrdersTab.tsx`

Add internal state:
- `searchQuery` (unit #, vendor, description) — debounced 200ms
- `statusFilter`: `'all' | 'open' | 'parts_ordered' | 'in_progress'`
- `serviceTypeFilter`: `'all' | 'pm' | 'repair' | 'tire' | 'inspection' | 'other'`
- localStorage persistence with `wo-*` keys

Compute counts from `workOrders` for the summary strip:
- Open, Parts Ordered, In Progress, Reimbursable (total $ est.)

Layout becomes:

```tsx
<div className="space-y-4">
  {/* Summary strip — mirrors PMFleetHealthSummary */}
  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
    <span className="text-sm font-medium text-muted-foreground mr-2">Active Work Orders</span>
    <button>Clock icon · {openCount} Open</button>     {/* clickable filter */}
    <Divider />
    <button>Package icon · {partsCount} Parts Ordered</button>
    <Divider />
    <button>Wrench icon · {inProgressCount} In Progress</button>
    <div className="ml-auto text-xs text-muted-foreground">
      {total} active · ${totalCostEst.toLocaleString()} est.
    </div>
  </div>

  {/* Filters row — mirrors PMScheduleFilters */}
  <div className="flex flex-wrap items-center gap-3 pb-2">
    <SearchInput />                       {/* pl-10, max-w-sm */}
    <DropdownMenu>Status</DropdownMenu>   {/* with color dot per status */}
    <DropdownMenu>Service Type</DropdownMenu>
  </div>

  {/* Data container — unchanged structure, wrapped in rounded-md border */}
  <div className="rounded-md border">
    <Table>…existing columns…</Table>
  </div>
</div>
```

Filtered list = workOrders → search match → status match → service-type match. Empty state when filters return zero matches uses the same icon + message pattern as PM Schedule's "No matching trucks" block.

All existing handlers (`handleStatusChange`, `handleCompleteClick`, `onViewTruck`, reimbursable row highlight, status `Select` per row, Complete button) stay exactly as-is.

## 2. Service History tab — `src/components/maintenance/ServiceHistoryTab.tsx`

Currently has a bare search input. Bring it up to the same shape.

Add state:
- existing `searchQuery` (already debounced via `useDebouncedCallback`)
- `serviceTypeFilter`: `'all' | 'pm' | 'repair' | 'tire' | 'inspection' | 'other'`
- `dateRangeFilter`: `'all' | '30d' | '90d' | '365d'` (look-back selector, mirrors PM's "look-ahead" dropdown)
- localStorage persistence with `sh-*` keys

Compute summary metrics from `history`:
- Records in range, total cost in range, count by source (work_order vs maintenance_log)

Layout:

```tsx
<div className="space-y-4">
  {/* Summary strip */}
  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
    <span className="text-sm font-medium text-muted-foreground mr-2">Service History</span>
    <Pill icon={History}>{filteredCount} Records</Pill>
    <Divider />
    <Pill icon={Wrench}>{woCount} Work Orders</Pill>
    <Divider />
    <Pill icon={ClipboardList}>{logCount} Manual Logs</Pill>
    <div className="ml-auto text-xs text-muted-foreground">
      ${totalCost.toLocaleString()} total in range
    </div>
  </div>

  {/* Filters row */}
  <div className="flex flex-wrap items-center gap-3 pb-2">
    <SearchInput />               {/* existing input, restyled to PM pattern (pl-10) */}
    <DropdownMenu>Service Type</DropdownMenu>
    <DropdownMenu>Last 30 / 90 / 365 days / All</DropdownMenu>
  </div>

  {/* Data container — existing table */}
  <div className="rounded-md border">
    <Table>…existing columns…</Table>
  </div>

  {/* Existing Edit Dialog + Delete AlertDialog — untouched */}
</div>
```

Filtered list = history → service-type match → date-range match (existing search continues server-side via `debouncedQuery` argument to `useServiceHistory`). All edit/delete flows, dropdown menus, and modals stay intact.

## 3. Tabs container — `src/pages/MaintenanceManagement.tsx`

No structural changes. Each tab keeps its own `mt-0` content slot. The redesign happens entirely inside the two tab components so the third tab (`PreventiveMaintenanceTab`) — the visual reference — remains the source of truth.

## What does NOT change

- `MaintenanceKPICards`, `PreventiveMaintenanceTab`, `PredictiveServiceCalendar`, `NewWorkOrderSheet`, `TruckHistoryDrawer`, `CompleteJobModal`, all hooks in `useMaintenanceData`, the Edit/Delete dialogs in Service History.
- Database, RLS, route guards, types.
- Cell-level rendering (status badges, service-type chips, currency formatting, action buttons).

## Files touched

- `src/components/maintenance/ActiveWorkOrdersTab.tsx` — add summary strip + filters row + filter state, wrap table in `rounded-md border` (already present), no changes to row rendering.
- `src/components/maintenance/ServiceHistoryTab.tsx` — replace bare search with full summary + filters row, add date-range and service-type filters, preserve all dialogs.
