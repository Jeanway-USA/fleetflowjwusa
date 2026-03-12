

## Plan: Mobile-Responsive Tables, Double-Tap Interactions, and Bulk Actions

### Overview
Upgrade the shared `DataTable` component and standardize bulk actions across all major pages. Drivers uses a card layout and is out of scope for table changes.

---

### Task 1: Mobile-Friendly Tables

**File: `src/components/shared/DataTable.tsx`**

- The wrapper already has `overflow-auto` (line 282), so horizontal scrolling works. Add `min-w-[640px]` to the inner `<table>` element so columns don't crush on narrow viewports — they scroll instead.
- Add an optional `hiddenOnMobile?: boolean` property to the `Column<T>` interface. When set, wrap the `<th>` and `<td>` in a `hidden md:table-cell` class so non-essential columns auto-hide on small screens.
- Apply `hiddenOnMobile: true` to less critical columns across pages (e.g., Phone, Location in CRM; Carrier in AgencyLoads; Details columns in Trucks/Trailers).

**Affected pages:** CRM, Trucks, Trailers, FleetLoads, AgencyLoads, Incidents, Documents.

---

### Task 2: Double-Click / Double-Tap to View or Edit

**File: `src/components/shared/DataTable.tsx`**

- Add a new prop `onRowDoubleClick?: (item: T) => void` to `DataTableProps`.
- On the `<tr>` element, add `onDoubleClick={() => onRowDoubleClick?.(item)}`.
- Implement a touch double-tap detector: track `lastTapTime` via a `useRef`. On `onTouchEnd`, if the time since last tap is < 300ms and the same row, fire `onRowDoubleClick`. Reset on single tap.
- The existing `onRowClick` (single click) remains unchanged and fires immediately.

**Wiring per page:**
- **CRM:** `onRowDoubleClick` → `setDetailContact(contact)` (already opens the detail sheet)
- **FleetLoads:** `onRowDoubleClick` → open the load edit dialog
- **Trucks:** `onRowDoubleClick` → open truck edit dialog
- **Trailers:** `onRowDoubleClick` → open trailer edit dialog
- **AgencyLoads:** `onRowDoubleClick` → `openDialog(load)`
- **Incidents:** `onRowDoubleClick` → open incident edit dialog

---

### Task 3: Standardize Bulk Actions

The `DataTable` already supports `selectable`, `selectedIds`, `onSelectionChange`, and `bulkActions` props — but no page currently uses them. The Finance page has its own custom bulk logic outside DataTable.

**For each page, add:**

1. A `useState<Set<string>>` for selected IDs.
2. Pass `selectable={true}`, `selectedIds`, `onSelectionChange` to `<DataTable>`.
3. Pass a `bulkActions` render prop that returns:
   - **Mass Delete** button → opens a `ConfirmDeleteDialog`, then runs `supabase.from(table).delete().in('id', [...ids])`.
   - **Mass Edit** button → opens a dialog with shared fields (e.g., status), then runs `supabase.from(table).update(updates).in('id', [...ids])`.
4. Clear selection after successful mutation. Show toast on success/error.

**Pages and their bulk edit fields:**
| Page | Table | Mass Edit Fields |
|------|-------|-----------------|
| Trucks | `trucks` | `status` |
| Trailers | `trailers` | `status` |
| FleetLoads | `fleet_loads` | `status` |
| AgencyLoads | `agency_loads` | `status` |
| CRM | `crm_contacts` (+ resource/facility sources) | `contact_type`, `tags` |
| Incidents | `incidents` | `status` |

Each page will add a mass edit dialog with only the relevant fields, plus a mass delete confirmation using the existing `ConfirmDeleteDialog` component.

---

### Technical Details

**Column interface change:**
```typescript
interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  hiddenOnMobile?: boolean; // NEW
}
```

**Double-tap detection (in DataTable):**
```typescript
const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });

// On each row's onTouchEnd:
const now = Date.now();
if (now - lastTapRef.current.time < 300 && lastTapRef.current.id === item.id) {
  onRowDoubleClick?.(item);
  lastTapRef.current = { time: 0, id: '' };
} else {
  lastTapRef.current = { time: now, id: item.id };
}
```

**Bulk action pattern (per page):**
```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

<DataTable
  selectable
  selectedIds={selectedIds}
  onSelectionChange={setSelectedIds}
  bulkActions={(ids) => (
    <>
      <Button size="sm" variant="outline" onClick={() => setMassEditOpen(true)}>
        <Pencil className="mr-1 h-3 w-3" /> Edit ({ids.size})
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setMassDeleteOpen(true)}>
        <Trash2 className="mr-1 h-3 w-3" /> Delete ({ids.size})
      </Button>
    </>
  )}
/>
```

---

### Files Modified
- `src/components/shared/DataTable.tsx` — mobile column hiding, double-click/tap, min-width
- `src/pages/Trucks.tsx` — bulk actions, double-click, hiddenOnMobile columns
- `src/pages/Trailers.tsx` — bulk actions, double-click, hiddenOnMobile columns
- `src/pages/FleetLoads.tsx` — bulk actions, double-click, hiddenOnMobile columns
- `src/pages/AgencyLoads.tsx` — bulk actions, double-click, hiddenOnMobile columns
- `src/pages/CRM.tsx` — bulk actions, double-click, hiddenOnMobile columns
- `src/pages/Incidents.tsx` — bulk actions, double-click, hiddenOnMobile columns

### Not Changed
- `src/pages/Drivers.tsx` — uses card grid, not DataTable
- `src/pages/Finance.tsx` — already has its own bulk logic with custom table
- `src/components/ui/table.tsx` — no changes needed (DataTable doesn't use it)

