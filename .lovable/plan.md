

## Bulk CSV Import for Drivers and Trucks

### Approach
Create a single reusable `CSVImportDialog` component that handles file upload, column mapping, preview, and bulk insert. Then integrate it into both `Drivers.tsx` and `Trucks.tsx` pages via an "Import CSV" button in the `PageHeader` children slot.

### New Dependency
- `papaparse` — CSV parsing library

### New Component: `src/components/shared/CSVImportDialog.tsx`
A multi-step dialog:

**Step 1 — Upload**: Drag-and-drop zone (or click to browse) accepting `.csv` files. Parse with `papaparse`.

**Step 2 — Map Columns**: Show detected CSV headers on the left, database field dropdowns on the right. Each target entity (drivers/trucks) passes its field definitions as a prop:
- **Drivers fields**: `first_name`, `last_name`, `email`, `phone`, `license_number`, `license_expiry`, `medical_card_expiry`, `hire_date`, `status`, `pay_type`, `pay_rate`
- **Trucks fields**: `unit_number`, `make`, `model`, `year`, `vin`, `license_plate`, `license_plate_state`, `status`, `purchase_mileage`

Auto-match CSV headers to fields when names are similar (fuzzy lowercase match).

**Step 3 — Preview**: Table showing the first 3 mapped rows with target column headers. Highlight any rows missing required fields (`first_name`/`last_name` for drivers, `unit_number` for trucks).

**Step 4 — Confirm Import**: `LoadingButton` that bulk-inserts all valid rows via `supabase.from(tableName).insert(rows)`. The component receives `tableName` and `orgId` as props and automatically sets `org_id` on each row. Shows success toast with count, then invalidates the relevant query key.

Props interface:
```typescript
interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: 'drivers' | 'trucks';
  fields: { key: string; label: string; required?: boolean }[];
  queryKey: string[];
}
```

### Edits to `src/pages/Drivers.tsx`
- Import `CSVImportDialog` and add state `csvImportOpen`
- Add "Import CSV" button as `PageHeader` children (before the action button)
- Render `<CSVImportDialog>` with drivers field definitions

### Edits to `src/pages/Trucks.tsx`
- Same pattern: import, state, button in `PageHeader` children, render dialog with trucks field definitions

### No database changes needed
Both tables already exist with proper RLS policies for insert by owner/dispatcher roles.

### Files
| File | Action |
|------|--------|
| `package.json` | Add `papaparse` + `@types/papaparse` |
| `src/components/shared/CSVImportDialog.tsx` | Create — reusable multi-step CSV import dialog |
| `src/pages/Drivers.tsx` | Add Import CSV button + dialog |
| `src/pages/Trucks.tsx` | Add Import CSV button + dialog |

