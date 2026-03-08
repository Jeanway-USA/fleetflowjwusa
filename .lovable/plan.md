

## Standardize Action Columns to DropdownMenu Pattern

### Scope
11 tables currently use inline icon buttons for actions. Convert each to the standard `MoreHorizontal` dropdown pattern. Two tables are already done (ActiveLoadsBoard, Drivers). SuperAdmin already uses dropdowns. One table (UnsyncedExpenses) has a single "Save" action — not applicable.

### Tables to Convert (9 files)

| File | Current Actions | Dropdown Items |
|---|---|---|
| `src/pages/FleetLoads.tsx` | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/pages/Trucks.tsx` | View, Edit, Delete buttons | View Details, Edit, Separator, Delete (destructive) |
| `src/pages/Trailers.tsx` | View, Edit, Delete buttons | View Details, Edit, Separator, Delete (destructive) |
| `src/pages/Incidents.tsx` | View, Edit, Delete buttons | View Details, Edit, Separator, Delete (destructive) |
| `src/pages/AgencyLoads.tsx` | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/pages/CRM.tsx` | View, Edit, Delete buttons (conditional) | View Details, Edit (if canEdit), Separator, Delete (destructive, if canEdit) |
| `src/pages/Finance.tsx` (expenses table) | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/pages/IFTA.tsx` (fuel purchases) | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/components/finance/PayrollTab.tsx` | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/components/finance/CommissionsTab.tsx` | Edit, Delete buttons | Edit, Separator, Delete (destructive) |
| `src/components/finance/SettlementsTab.tsx` | View, Edit, Delete buttons | View Details, Edit, Separator, Delete (destructive) |
| `src/components/maintenance/ServiceHistoryTab.tsx` | Edit, Delete (conditional on source) | Edit, Separator, Delete (destructive) — only shown for work_order source |
| `src/components/maintenance/ActiveWorkOrdersTab.tsx` | Status dropdown + Complete button | **Skip** — this table has a status selector and a "Complete" CTA, not standard CRUD actions |

### Skip List
- **ActiveWorkOrdersTab**: Has a status `<Select>` and a "Complete" button — these are workflow actions, not CRUD. Leave as-is.
- **UnsyncedExpenses**: Single "Save" button per row. Not applicable.
- **SuperAdminDashboard**: Already uses `OrgActionsDropdown` with `MoreHorizontal`.

### Pattern Applied to Each Table
Replace `<div className="flex gap-1/2">` containing icon buttons with:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8"
      onClick={(e) => e.stopPropagation()}>
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {/* View Details — only if table had a View action */}
    <DropdownMenuItem onClick={...}>
      <Eye className="mr-2 h-4 w-4" /> View Details
    </DropdownMenuItem>
    <DropdownMenuItem onClick={...}>
      <Pencil className="mr-2 h-4 w-4" /> Edit
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive" onClick={...}>
      <Trash2 className="mr-2 h-4 w-4" /> Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Import Changes
Each file needs: `MoreHorizontal` from lucide-react, plus `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `DropdownMenuSeparator` from `@/components/ui/dropdown-menu`. Existing unused icon button imports can be cleaned up where no longer needed elsewhere.

### Files Modified (12)
| File | Action |
|---|---|
| `src/pages/FleetLoads.tsx` | Convert action column to dropdown |
| `src/pages/Trucks.tsx` | Convert action column to dropdown |
| `src/pages/Trailers.tsx` | Convert action column to dropdown |
| `src/pages/Incidents.tsx` | Convert action column to dropdown |
| `src/pages/AgencyLoads.tsx` | Convert action column to dropdown |
| `src/pages/CRM.tsx` | Convert action column to dropdown (respect `canEdit` conditional) |
| `src/pages/Finance.tsx` | Convert expenses table action column to dropdown |
| `src/pages/IFTA.tsx` | Convert fuel purchases action column to dropdown |
| `src/components/finance/PayrollTab.tsx` | Convert action column to dropdown |
| `src/components/finance/CommissionsTab.tsx` | Convert action column to dropdown |
| `src/components/finance/SettlementsTab.tsx` | Convert action column to dropdown |
| `src/components/maintenance/ServiceHistoryTab.tsx` | Convert action column to dropdown (conditional rendering preserved) |

