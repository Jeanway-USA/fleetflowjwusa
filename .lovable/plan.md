

## Standardize Action Dropdown on ActiveLoadsBoard and Drivers Page

### Current State
- **ActiveLoadsBoard**: Already has a `DropdownMenu` with `MoreHorizontal` trigger but only contains "View Details". Missing "Edit" and "Delete" actions.
- **Drivers page**: Uses individual icon buttons (Eye, Pencil, Trash2, FileText) in the card header. No dropdown menu pattern.

### Changes

**1. `src/components/dispatcher/ActiveLoadsBoard.tsx`**
- Add "Edit" dropdown item that navigates to `/fleet-loads` (or opens edit flow if one exists)
- Add a `DropdownMenuSeparator` before "Delete"
- Add "Delete" item styled with `className="text-destructive"` — wired to remove the load (with confirmation or undo pattern)
- Import `Pencil`, `Trash2`, and `DropdownMenuSeparator`

**2. `src/pages/Drivers.tsx`**
- Replace the row of individual icon buttons (Eye, FileText, Pencil, Trash2) in each card header with a single `DropdownMenu` triggered by a `MoreHorizontal` icon button
- Dropdown items:
  - "View Dashboard" (Eye icon) — navigates to spectator view (only if `isOwner`)
  - "Documents" (FileText icon) — opens document panel
  - "Edit" (Pencil icon) — opens edit dialog
  - Separator
  - "Delete" (Trash2 icon, `text-destructive`) — calls `deleteWithUndo`
- Import `MoreHorizontal`, `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `DropdownMenuSeparator`

### Files Modified
| File | Action |
|---|---|
| `src/components/dispatcher/ActiveLoadsBoard.tsx` | Add Edit and Delete items to existing dropdown |
| `src/pages/Drivers.tsx` | Replace icon button row with standardized DropdownMenu |

